import { IntrospectionEvents } from '@senars/core';

export class ReasoningManager {
    constructor(app) {
        this.app = app;
        this.lmController = null;
        this.localToolsBridge = null;
        this.isReasonerRunning = false;
        this.reasonerDelay = 100;
        this.reasonerLoopId = null;
        this._narEventsBound = false;
    }

    async initialize() {
        try {
            const module = await import('../../agent/LMAgentController.js');
            this.lmController = new module.LMAgentController(this.app.logger);
            this._setupLMEvents();

            try {
                await this.lmController.initialize();
                this.app._updateLLMStatus('Ready', 'online');
                this.app._updateReasonerStatus('Online (via LLM Bridge)', 'online');
                this._bindNAREvents();
            } catch (e) {
                console.warn('LLM init failed (might need config):', e);
                if (!this.lmController.toolsBridge) {
                    await this._initLocalBridge();
                    this.app._updateLLMStatus('Config Required', 'warning');
                } else {
                    this.app._updateLLMStatus('Config Required', 'warning');
                    this.app._updateReasonerStatus('Offline', 'offline');
                }
            }
        } catch (e) {
            console.error('Failed to load LMAgentController module:', e);
            await this._initLocalBridge();

            if (this.localToolsBridge) {
                this.app._updateLLMStatus('Offline', 'offline');
                this.app.toastManager.show('LLM unavailable - Running in Reasoner Only mode', 'info');
            } else {
                const errorMsg = e.message || String(e);
                this.app._updateLLMStatus('Module Error', 'error');
                this.app._updateReasonerStatus('Error', 'error');
                this.app.log(`Failed to load LMAgentController: ${errorMsg}`, 'error');
                this.app.toastManager.show(`Module Error: ${errorMsg}`, 'error');
            }
        }
    }

    async _initLocalBridge() {
        try {
            const module = await import('../../agent/AgentToolsBridge.js');
            this.localToolsBridge = new module.AgentToolsBridge();
            await this.localToolsBridge.initialize();
            this.app.log('Local Reasoner initialized successfully', 'system');
            this.app._updateReasonerStatus('Online (Local)', 'online');
            this._bindNAREvents();
        } catch (e) {
            console.error('Failed to load AgentToolsBridge:', e);
            this.app.log('Failed to load local reasoner', 'error');
            this.app._updateReasonerStatus('Load Failed', 'error');
        }
    }

    _getNAR() {
        if (this.lmController && this.lmController.toolsBridge && this.lmController.toolsBridge.getNAR()) {
            return this.lmController.toolsBridge.getNAR();
        }
        if (this.localToolsBridge) {
            return this.localToolsBridge.getNAR();
        }
        return null;
    }

    _bindNAREvents() {
        const nar = this._getNAR();
        if (!nar || this._narEventsBound) return;

        if (nar.hasOwnProperty('traceEnabled')) {
            nar.traceEnabled = true;
        }

        if (nar.on) {
            nar.on(IntrospectionEvents.TASK_ADDED, (data) => {
                console.log('ExplorerApp: TASK_ADDED event received', data);
                this.app.log(`INPUT: ${data.task.term}`, 'user');
                this.app._onTaskAdded(data.task);
            });

            nar.on(IntrospectionEvents.REASONING_DERIVATION, (data) => {
                console.log('ExplorerApp: REASONING_DERIVATION event received', data);
                this.app.log(`DERIVED: ${data.derivedTask.term} (${data.inferenceRule})`, 'system');

                this.app._onDerivation(data);

                const sourceId = data.task?.term?.toString();
                const beliefId = data.belief?.term?.toString();
                const derivedId = data.derivedTask?.term?.toString();

                if (this.app.graph && this.app.graph.animateReasoning) {
                     this.app.graph.animateReasoning(sourceId, beliefId, derivedId);
                }
            });

            nar.on(IntrospectionEvents.TASK_ERROR, (data) => {
                console.error('ExplorerApp: TASK_ERROR event received', data);
                this.app.log(`ERROR: ${data.error}`, 'error');
            });

            this._narEventsBound = true;
            console.log('ExplorerApp: Bound to NAR events');
        }
    }

    _setupLMEvents() {
        if (!this.lmController) return;
        this.lmController.on('model-load-start', () => this.app._updateLLMStatus('Loading...', 'loading'));
        this.lmController.on('model-load-complete', () => this.app._updateLLMStatus('Online', 'online'));
    }

    toggleReasoner(run) {
        this.isReasonerRunning = run;

        if (this.app.statusBar) {
            this.app.statusBar.setReasonerRunning(run);
        }

        if (run) {
            this._runReasonerLoop();
            this.app.log('Reasoner started', 'system');
        } else {
            if (this.reasonerLoopId) {
                clearTimeout(this.reasonerLoopId);
                this.reasonerLoopId = null;
            }
            this.app.log('Reasoner paused', 'system');
        }
    }

    async stepReasoner(steps = 1) {
        const nar = this._getNAR();
        if (!nar) {
            this.app.log('Reasoner not available (LLM not connected?)', 'warning');
            return;
        }

        try {
            for (let i = 0; i < steps; i++) {
                await nar.step();
            }
        } catch (e) {
            this.app.log(`Reasoner step error: ${e.message}`, 'error');
            this.toggleReasoner(false);
        }
    }

    async _runReasonerLoop() {
        if (!this.isReasonerRunning) return;

        await this.stepReasoner();

        if (this.isReasonerRunning) {
            this.reasonerLoopId = setTimeout(() => this._runReasonerLoop(), this.reasonerDelay);
        }
    }

    handleReasonerControl(action, value) {
        switch (action) {
            case 'run':
                this.toggleReasoner(true);
                break;
            case 'pause':
                this.toggleReasoner(false);
                break;
            case 'step':
                this.stepReasoner(value || 1);
                break;
            case 'throttle':
                this.reasonerDelay = value;
                break;
        }
    }
}
