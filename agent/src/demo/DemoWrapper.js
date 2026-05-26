import {DemosManager} from './DemosManager.js';
import {DemoStateManager} from './DemoStateManager.js';
import {DemoValidator} from './DemoValidator.js';

/**
 * DemoWrapper - A system that wraps demos to provide remote control and introspection
 */
export class DemoWrapper {
    constructor(config = {}) {
        this.config = {
            autoStart: false,
            stepInterval: 1000, // ms for auto-stepping if needed
            ...config
        };

        this.isRunning = false;
        this.isPaused = false;
        this.currentStep = 0;
        this.currentDemoId = null;
        this.demos = new Map();
        this.webSocketMonitor = null;
        this.nar = null;

        // Initialize the modules
        this.demosManager = new DemosManager();
        this.demoStateManager = new DemoStateManager();

        // Register built-in demos
        this.registerBuiltinDemos();
    }

    async initialize(nar, webSocketMonitor) {
        this.nar = nar;
        this.webSocketMonitor = webSocketMonitor;

        // Initialize demos manager to load file-based demos
        await this.demosManager.initialize();

        // Refresh registered demos
        this.demos.clear();
        this.registerBuiltinDemos();

        // Register demo control message handler
        if (webSocketMonitor) {
            webSocketMonitor.registerClientMessageHandler('demoControl', this.handleDemoControl.bind(this));
        }
    }

    registerBuiltinDemos() {
        const builtinDemos = this.demosManager.getAvailableDemos();

        builtinDemos.forEach(config => {
            this.registerDemo(config.id, {
                name: config.name,
                description: config.description,
                handler: config.handler,
                parameters: {
                    stepDelay: {
                        type: 'number',
                        defaultValue: config.stepDelay,
                        description: 'Delay between steps in ms'
                    }
                }
            });
        });
    }

    registerDemo(id, config) {
        this.demos.set(id, {
            id,
            ...config
        });
    }

    getAvailableDemos() {
        return Array.from(this.demos.values()).map(demo => ({
            id: demo.id,
            name: demo.name,
            description: demo.description,
            parameters: Object.entries(demo.parameters || {}).map(([name, param]) => ({
                name,
                type: param.type,
                defaultValue: param.defaultValue,
                description: param.description
            }))
        }));
    }

    async handleDemoControl(data) {
        try {
            // Validate input data using the validator module
            if (!DemoValidator.validateDemoControl(data)) {return;}

            const {command, demoId, parameters} = data.payload;

            // Use a command map to reduce switch statement
            const commandMap = {
                'start': () => this.startDemo(demoId, parameters),
                'stop': () => this.stopDemo(demoId),
                'pause': () => this.pauseDemo(demoId),
                'resume': () => this.resumeDemo(demoId),
                'step': () => this.stepDemo(demoId, parameters),
                'configure': () => this.configureDemo(demoId, parameters),
                'list': () => this.sendDemoList(),
                'getSource': () => this.sendDemoSource(demoId),
                'runCustom': () => this.runCustomDemo(parameters.code, parameters.type)
            };

            const handler = commandMap[command] || (() => this._handleUnknownCommand(demoId, command));
            await handler();
        } catch (error) {
            console.error('Error handling demo control:', error);
        }
    }

    async _handleUnknownCommand(demoId, command) {
        console.warn(`Unknown demo command: ${command}`);
    }

    async startDemo(demoId, parameters = {}) {
        const demo = this.demos.get(demoId);
        if (!demo) {
            console.error(`Demo ${demoId} not found`);
            await this.sendDemoState(demoId, {
                state: 'error',
                error: `Demo ${demoId} not found`
            });
            return false;
        }

        // Stop any currently running demo to avoid conflicts
        const runningDemoId = this.demoStateManager.getRunningDemoId();
        if (runningDemoId && runningDemoId !== demoId) {
            await this.stopDemo(runningDemoId);
        }

        this.currentDemoId = demoId;
        this.isRunning = true;
        this.isPaused = false;
        this.currentStep = 0;

        // Use the DemoStateManager to initialize state
        this.demoStateManager.initializeDemoState(demoId, parameters);

        // Notify UI of demo state
        await this.sendDemoState(demoId, {
            state: 'running',
            progress: 0,
            currentStep: 0,
            parameters,
            startTime: Date.now()
        });

        try {
            // Execute the demo handler with proper context
            await this._executeDemoHandler(demo, parameters);

            // Update final state when demo completes successfully
            this.demoStateManager.finalizeDemoState(demoId, 'completed');
            await this.sendDemoState(demoId, {
                state: 'completed',
                progress: 100,
                endTime: Date.now()
            });
        } catch (error) {
            console.error(`Error running demo ${demoId}:`, error);

            this.demoStateManager.finalizeDemoState(demoId, 'error', {
                error: error.message,
                errorMessage: error.message,
                errorStack: error.stack
            });

            await this.sendDemoState(demoId, {
                state: 'error',
                error: error.message,
                errorMessage: error.message,
                endTime: Date.now()
            });

            // Ensure we clean up after an error
            this.isRunning = false;
            this.isPaused = false;
            this.currentDemoId = null;
        } finally {
            // Only clear running flags if we're still the running demo
            if (this.currentDemoId === demoId) {
                this.isRunning = false;
                this.isPaused = false;
                this.currentDemoId = null;

                // Ensure the final state is stopped if not already set to completed or error
                const currentState = this.demoStateManager.getDemoState(demoId);
                if (currentState?.state === 'running') {
                    this.demoStateManager.finalizeDemoState(demoId, 'stopped');
                    await this.sendDemoState(demoId, {
                        state: 'stopped',
                        endTime: Date.now()
                    });
                }
            }
        }

        return true;
    }

    async _executeDemoHandler(demo, parameters) {
        if (typeof demo.handler === 'function') {
            await demo.handler(
                this.nar,
                this.sendDemoStep.bind(this),
                this.waitIfNotPaused.bind(this),
                parameters
            );
        }
    }

    async stopDemo(demoId) {
        // Ensure any running process is stopped
        this.demosManager.stopCurrentDemo();

        this.isRunning = false;
        this.isPaused = false;
        this.currentDemoId = null;

        const targetDemoId = demoId || this.currentDemoId;
        if (targetDemoId) {
            this.demoStateManager.updateDemoState(targetDemoId, {state: 'stopped', demoId: targetDemoId});
            await this.sendDemoState(targetDemoId, {state: 'stopped'});
        }
    }

    async pauseDemo(demoId) {
        this.isPaused = true;
        this.demoStateManager.updateDemoState(demoId, {state: 'paused'});
        await this.sendDemoState(demoId, {state: 'paused'});
    }

    async resumeDemo(demoId) {
        this.isPaused = false;
        this.singleStep = false;
        this.demoStateManager.updateDemoState(demoId, {state: 'running'});
        await this.sendDemoState(demoId, {state: 'running'});
    }

    async stepDemo(demoId, parameters = {}) {
        if (this.isPaused) {
            this.singleStep = true;
            console.log(`Stepping demo ${demoId}`);
        }
    }

    async configureDemo(demoId, parameters) {
        // Update demo configuration
        console.log(`Configure demo ${demoId} with parameters:`, parameters);
    }

    async runCustomDemo(code, type) {
        await this.stopDemo();

        this.isRunning = true;
        this.currentDemoId = 'custom';

        await this.sendDemoState('custom', {state: 'running'});

        try {
            await this.demosManager.runCustomDemo(code, type,
                this.sendDemoStep.bind(this),
                this.waitIfNotPaused.bind(this),
                this.nar
            );
            await this.sendDemoState('custom', {state: 'completed'});
        } catch (error) {
            console.error('Error running custom demo:', error);
            await this.sendDemoState('custom', {state: 'error', error: error.message});
        } finally {
            this.isRunning = false;
            this.currentDemoId = null;
        }
    }

    async sendDemoState(demoId, state) {
        if (this.webSocketMonitor) {
            this.webSocketMonitor._broadcastToSubscribedClients({
                type: 'demoState',
                payload: {demoId, ...state}
            });
        }
    }

    async sendDemoStep(demoId, step, description, data = {}) {
        if (this.webSocketMonitor) {
            this.webSocketMonitor._broadcastToSubscribedClients({
                type: 'demoStep',
                payload: {demoId, step, description, data}
            });
        }
    }

    async sendDemoMetrics(demoId, metrics) {
        if (this.webSocketMonitor) {
            this.webSocketMonitor._broadcastToSubscribedClients({
                type: 'demoMetrics',
                payload: {demoId, metrics}
            });
        }
    }

    async sendDemoList() {
        if (this.webSocketMonitor) {
            this.webSocketMonitor._broadcastToSubscribedClients({
                type: 'demoList',
                payload: this.getAvailableDemos()
            });
        }
    }

    async sendDemoSource(demoId) {
        if (this.webSocketMonitor) {
            try {
                const source = await this.demosManager.getDemoSource(demoId);
                this.webSocketMonitor._broadcastToSubscribedClients({
                    type: 'demoSource',
                    payload: {demoId, source}
                });
            } catch (e) {
                console.error('Error sending demo source:', e);
            }
        }
    }

    async waitIfNotPaused(delay = 1000) {
        const checkInterval = 100;
        let waited = 0;

        while ((waited < delay || this.isPaused) && this.isRunning) {
            if (this.isPaused) {
                if (this.singleStep) {
                    this.singleStep = false;
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
                continue;
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }

        // Check if we're still running after the delay
        if (!this.isRunning) {
            throw new Error('Demo stopped during wait');
        }
    }

    async runPeriodicMetricsUpdate() {
        if (!this.nar || !this.webSocketMonitor) {return;}

        // Track previous concept priorities to detect changes
        let previousPriorities = new Map();
        let previousTaskCounts = new Map();

        // Send periodic system metrics to visualize in UI
        const updateMetrics = async () => {
            if (this.isRunning || Object.keys(this.demoStateManager.getAllDemoStates()).some(id => this.demoStateManager.getDemoState(id)?.state !== 'stopped')) {
                // Get current system state
                const stats = this.nar.getStats ? this.nar.getStats() : {};
                const taskManagerStats = stats.taskManagerStats || {};

                const metrics = {
                    tasksProcessed: taskManagerStats.totalTasks || 0,
                    conceptsActive: this.nar.memory ? this.nar.memory.getAllConcepts().length : 0,
                    cyclesCompleted: this.nar.cycleCount || 0,
                    memoryUsage: this.nar.memory ? this.nar.memory.getDetailedStats?.().totalResourceUsage || 0 : 0,
                    activeDemos: Object.keys(this.demoStateManager.getAllDemoStates()).filter(id => this.demoStateManager.getDemoState(id)?.state === 'running').length,
                    systemLoad: 0 // Placeholder for system load metric
                };

                // Track concept priority fluctuations
                const priorityFluctuations = [];
                const conceptMetrics = [];

                if (this.nar) {
                    try {
                        const currentConceptPriorities = this.nar.getConceptPriorities();
                        const currentPriorities = new Map();
                        const currentTaskCounts = new Map();

                        for (const concept of currentConceptPriorities) {
                            const conceptName = concept.term;
                            const currentPriority = concept.priority;
                            const currentTaskCount = concept.totalTasks || 0;

                            currentPriorities.set(conceptName, currentPriority);
                            currentTaskCounts.set(conceptName, currentTaskCount);

                            // Check if this concept's priority has changed significantly
                            const previousPriority = previousPriorities.get(conceptName);
                            if (previousPriority !== undefined && Math.abs(currentPriority - previousPriority) > 0.001) { // Reduced threshold for more sensitivity
                                priorityFluctuations.push({
                                    concept: conceptName,
                                    oldPriority: previousPriority,
                                    newPriority: currentPriority,
                                    priorityChange: currentPriority - previousPriority,
                                    timestamp: Date.now()
                                });
                            }

                            // Track concept metrics for visualization
                            conceptMetrics.push({
                                term: conceptName,
                                priority: currentPriority,
                                activation: concept.activation || 0,
                                useCount: concept.useCount || 0,
                                totalTasks: currentTaskCount,
                                quality: concept.quality || 0
                            });
                        }

                        // Check for task count changes as well
                        for (const [conceptName, taskCount] of currentTaskCounts.entries()) {
                            const previousTaskCount = previousTaskCounts.get(conceptName);
                            if (previousTaskCount !== undefined && previousTaskCount !== taskCount) {
                                priorityFluctuations.push({
                                    concept: conceptName,
                                    oldTaskCount: previousTaskCount,
                                    newTaskCount: taskCount,
                                    changeType: 'taskCount',
                                    timestamp: Date.now()
                                });
                            }
                        }

                        // Update our reference to previous priorities and task counts
                        previousPriorities = currentPriorities;
                        previousTaskCounts = currentTaskCounts;

                    } catch (e) {
                        console.warn('Could not get concepts for priority tracking:', e);
                    }
                }

                // Add metrics to the data
                metrics.priorityFluctuations = priorityFluctuations;
                metrics.conceptMetrics = conceptMetrics;

                // Send metrics to all connected clients
                await this.sendDemoMetrics('system', metrics);
            }

            setTimeout(updateMetrics, 500); // Update metrics every 500ms for better visualization
        };

        await updateMetrics();
    }
}