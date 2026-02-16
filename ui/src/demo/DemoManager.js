import {InteractiveDemoManager} from './InteractiveDemoManager.js';

/**
 * DemoManager handles demo sequences and execution via backend integration
 */
export class DemoManager {
    constructor(uiElements, commandProcessor, logger) {
        this.uiElements = uiElements;
        this.commandProcessor = commandProcessor;
        this.logger = logger;
        this.demos = new Map();
        this.interactiveManager = new InteractiveDemoManager(this);

        // Define static demos (Universal Demos)
        this.STATIC_DEMOS = [
            {
                id: 'static-adaptive-reasoning',
                name: 'Adaptive Reasoning (Static)',
                description: 'Demonstrates adaptation to new evidence (client-side execution)',
                path: 'examples/metta/demos/adaptive_reasoning.metta'
            },
            {
                id: 'static-maze-solver',
                name: 'Maze Solver (Static)',
                description: 'Pathfinding in a grid (client-side execution)',
                path: 'examples/metta/demos/maze_solver.metta'
            },
            {
                id: 'static-truth-chain',
                name: 'Truth Chain (Static)',
                description: 'Multi-step deduction (client-side execution)',
                path: 'examples/metta/demos/truth_chain.metta'
            },
            {
                id: 'static-interactive-ui',
                name: 'Interactive UI Generation',
                description: 'Demonstrates dynamic UI generation and user input handling',
                path: 'examples/metta/demos/interactive_ui.metta',
                isInteractive: true
            }
        ];
    }

    /**
     * Initialize and request available demos
     */
    initialize() {
        this.processDemoList();
        this.requestDemoList();
    }

    /**
     * Request the list of demos from the backend
     */
    requestDemoList() {
        this.commandProcessor.executeControlCommand('demoControl', {
            command: 'list',
            demoId: 'system' // Dummy ID required by validator
        });
    }

    /**
     * Handle received demo list
     */
    handleDemoList(payload) {
        this.processDemoList(payload);
    }

    /**
     * Process the demo list (combining static and backend demos)
     */
    processDemoList(backendDemos = []) {
        this.demos.clear();

        // 1. Register Backend Demos
        if (Array.isArray(backendDemos)) {
            for (const demo of backendDemos) {
                this.demos.set(demo.id, demo);
            }
        }

        // 2. Register Static Demos
        for (const demo of this.STATIC_DEMOS) {
            this.demos.set(demo.id, demo);
        }

        // Log if backend demos were loaded
        if (Array.isArray(backendDemos) && backendDemos.length > 0) {
            console.debug(`Loaded ${backendDemos.length} backend demos`);
        }
    }

    /**
     * Run a specific demo by ID
     */
    async runDemo(demoId) {
        if (!demoId) {
            this.logger.log('Please select a demo', 'warning', '⚠️');
            return false;
        }

        const demo = this.demos.get(demoId);

        // Check if it's a static demo
        if (demo && demo.path) {
            if (demo.isInteractive) {
                return this.runInteractiveDemo(demo);
            }
            return this.runStaticDemo(demo);
        }

        // Otherwise assume backend demo
        this.commandProcessor.executeControlCommand('demoControl', {
            command: 'start',
            demoId: demoId
        });
        this.logger.log(`Requested demo start: ${demoId}`, 'info', '🚀');
        return true;
    }

    /**
     * Run an interactive demo (frontend simulation)
     */
    async runInteractiveDemo(demo) {
        this.logger.log(`Starting interactive demo: ${demo.name}`, 'info', '🚀');

        // Simulating the backend requesting input
        setTimeout(() => {
            this.interactiveManager.handleDemoRequest({
                requestId: 'req_001',
                type: 'widget_input',
                widgetType: 'slider',
                prompt: 'Please adjust the Truth Value for the concept "bird"',
                config: {
                    frequency: 0.5,
                    confidence: 0.9
                }
            });
        }, 1000);

        return true;
    }

    /**
     * Run a static demo by fetching and executing it line-by-line
     */
    async runStaticDemo(demo) {
        this.logger.log(`Starting static demo: ${demo.name}`, 'info', '🚀');

        try {
            const response = await fetch(`/${demo.path}`);
            if (!response.ok) throw new Error(`Failed to load demo file: ${response.statusText}`);

            const text = await response.text();
            const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(';'));
            const stepDelay = 1000;
            const delay = ms => new Promise(res => setTimeout(res, ms));

            for (const line of lines) {
                await delay(stepDelay);

                if (!this.commandProcessor.webSocketManager.isConnected()) {
                    this.logger.log('Demo execution paused: System disconnected', 'warning', '⚠️');
                    return false;
                }

                this.logger.log(`Executing: ${line}`, 'info', '▶️');
                this.commandProcessor.processCommand(line);
            }

            this.logger.log(`Demo ${demo.name} finished.`, 'success', '🏁');
            return true;
        } catch (error) {
            this.logger.log(`Error running static demo: ${error.message}`, 'error', '❌');
            return false;
        }
    }

    /**
     * Handle demo step updates
     */
    handleDemoStep(payload) {
        // {demoId, step, description, data}
        if (payload && payload.description) {
            this.logger.log(`Demo Step ${payload.step || '?'}: ${payload.description}`, 'info', '👣');
        }
    }

    /**
     * Handle demo state updates
     */
    handleDemoState(payload) {
        if (!payload) return;

        // Use a mapping approach for better maintainability
        const stateHandlers = {
            'completed': () => this.logger.log('Demo completed successfully', 'success', '🏁'),
            'error': () => this.logger.log(`Demo error: ${payload.error || 'Unknown error'}`, 'error', '❌'),
            'running': () => this.logger.log('Demo started...', 'info', '▶️'),
            'stopped': () => this.logger.log('Demo stopped', 'warning', '⏹️')
        };

        const handler = stateHandlers[payload.state];
        if (handler) {
            handler();
        }
    }
}
