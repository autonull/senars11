import { ConnectionInterface } from './ConnectionInterface.js';
// Dynamic import handled in connect() to avoid circular dependency
// import { Agent } from '@senars/agent';
import { Config } from '@senars/core';
import { MeTTaInterpreter } from '@senars/metta/MeTTaInterpreter.js';
import { Logger } from '../logging/Logger.js';

export class LocalConnectionManager extends ConnectionInterface {
    constructor() {
        super();
        this.logger = new Logger();
        this.nar = null;
        this.metta = null;
        this.connectionStatus = 'disconnected';
    }

    async connect() {
        try {
            this.updateStatus('connecting');
            // Try to load default config if available, else empty
            const config = Config ? Config.parse([]) : {};
            if (config.system) config.system.enableLogging = false;

            if (typeof window !== 'undefined') {
                config.components = {};
            } else {
                config.components ??= {};
                if (config.components.Metacognition) config.components.Metacognition.enabled = false;
                config.components.LMIntegration && (config.components.LMIntegration.enabled = false);
            }

            let AgentClass = null;
            try {
                // Dynamically import Agent to break circular dependency cycle:
                // LocalConnectionManager -> Agent -> NAR -> BaseComponent -> Logger -> UI_CONSTANTS -> core
                // If imported statically, this cycle causes a crash during module evaluation.
                const module = await import('@senars/agent');
                AgentClass = module.Agent;
            } catch (e) {
                console.warn('Agent module failed to load (Local Agent features unavailable):', e);
            }

            if (AgentClass) {
                this.nar = new AgentClass(config);
                await this.nar.initialize();

                if (this.nar.eventBus) {
                    this.nar.eventBus.on('*', (data) => {
                        const type = data.eventName || data.type;
                        this.dispatchMessage({ type, payload: data, timestamp: Date.now() });
                    });
                }
            }

            if (MeTTaInterpreter && this.nar) {
                this.metta = new MeTTaInterpreter(this.nar, {
                    ...config,
                    fs: null, path: null, url: null
                });
                await this.metta.initialize();
            }

            this.updateStatus('connected');
            return true;
        } catch (error) {
            console.error("Local connection failed", error);
            this.updateStatus('error');
            return false;
        }
    }

    isConnected() { return this.connectionStatus === 'connected'; }

    sendMessage(type, payload) {
        if (!this.isConnected()) {
            console.warn("LocalConnectionManager: Not connected. Message dropped:", type);
            return false;
        }
        this.processLocalMessage(type, payload);
        return true;
    }

    async processLocalMessage(type, payload) {
        try {
            switch (type) {
                case 'agent/input':
                case 'narseseInput':
                    await this.handleInput(payload, type);
                    break;
                case 'control/reset':
                    await this.handleReset();
                    break;
                case 'control/step':
                    if (this.nar) await this.nar.cycle();
                    break;
                case 'control/start':
                    if (this.nar) this.nar.run();
                    break;
                case 'control/stop':
                case 'control/pause':
                    if (this.nar) this.nar.stop();
                    break;
                default:
                    console.log("LocalConnectionManager: Unhandled message type", type);
            }
        } catch (e) {
            this.logger.log(`Local execution error: ${e.message}`, 'error', '🚨');
        }
    }

    async handleInput(payload, type) {
        const text = payload.text || payload.input || payload;

        if (type === 'narseseInput') {
             this.nar && await this.nar.input(text);
             return;
        }

        if (this.metta && (type === 'agent/input' || /^(!|\(|=\s)/.test(text))) {
            await this._handleMettaInput(text);
        } else if (this.nar) {
            await this._handleNarInput(text);
        }
    }

    async _handleMettaInput(text) {
        try {
            const results = await this.metta.run(text);
            if (!results?.length) return;

            const cleanResults = results.filter(r => {
                const str = r.toString();
                if (str.startsWith('(= ') || str.startsWith('(: ')) {
                    return !text.includes(str);
                }
                return true;
            });

            if (cleanResults.length === 0) return;

            const output = cleanResults.map(r => r.toString()).join('\n');
            const vizMatch = output.match(/__VIZ__:(\w+):(.+)/s);
            const uiMatch = output.match(/__UI__:(\S+)(?:\s+(.+))?/);

            if (vizMatch) {
                const [_, type, data] = vizMatch;
                try {
                    const parsedData = (type === 'graph' || type === 'chart') ? JSON.parse(data) : data;
                    this.dispatchMessage({ type: 'visualization', payload: { type, data: parsedData, content: data } });
                } catch (e) {
                    console.error('Failed to parse visualization data', e);
                    this.dispatchMessage({ type: 'agent/result', payload: { result: output } });
                }
            } else if (uiMatch) {
                const [_, cmd, args] = uiMatch;
                this.dispatchMessage({ type: 'ui-command', payload: { command: cmd, args: args ? args.trim() : '' } });
            } else {
                this.dispatchMessage({ type: 'agent/result', payload: { result: output } });
            }
        } catch (e) {
            this.dispatchMessage({ type: 'error', payload: { message: e.message } });
        }
    }

    async _handleNarInput(text) {
        if (this.nar.processInput) {
            const result = await this.nar.processInput(text);
            if (typeof result === 'string') {
                this.dispatchMessage({ type: 'agent/result', payload: { result } });
            }
        } else {
            await this.nar.input(text);
        }
    }

    async handleReset() {
        if (this.nar) await this.nar.reset();
        if (this.metta) {
            this.metta = new MeTTaInterpreter(this.nar, this.nar.config);
            await this.metta.initialize();
        }
        this.dispatchMessage({ type: 'system/reset', payload: {} });
    }

    disconnect() {
        this.connectionStatus = 'disconnected';
        this.notifyStatusChange('disconnected');
    }

    updateStatus(status) {
        this.connectionStatus = status;
        this.notifyStatusChange(status);
    }

    notifyStatusChange(status) {
        this.messageHandlers.get('connection.status')?.forEach(h => h(status));
    }
}
