import { ConnectionInterface } from './ConnectionInterface.js';
import { NAR } from '../../../core/src/nar/NAR.js';
import { MeTTaInterpreter } from '../../../metta/src/MeTTaInterpreter.js';
import { Config } from '../../../core/src/config/Config.js';
import { Logger } from '../logging/Logger.js';

export class LocalConnectionManager extends ConnectionInterface {
    constructor() {
        super();
        this.messageHandlers = new Map();
        this.logger = new Logger();
        this.nar = null;
        this.metta = null;
        this.connectionStatus = 'disconnected';
    }

    async connect() {
        try {
            this.updateStatus('connecting');
            const config = Config.parse([]);
            config.system = { ...config.system, enableLogging: false };

            if (typeof window !== 'undefined') {
                config.components = {};
            } else {
                config.components ??= {};
                if (config.components.Metacognition) config.components.Metacognition.enabled = false;
                else config.components.Metacognition = { enabled: false };
                config.components.LMIntegration && (config.components.LMIntegration.enabled = false);
            }

            this.nar = new NAR(config);
            await this.nar.initialize();

            this.metta = new MeTTaInterpreter(this.nar, {
                ...config,
                fs: null, path: null, url: null
            });
            await this.metta.initialize();

            this.nar.eventBus.on('*', (type, payload) => this.dispatchMessage({ type, payload, timestamp: Date.now() }));

            this.updateStatus('connected');
            this.logger.log('Connected to Local SeNARS', 'success', '💻');

            setTimeout(() => this.dispatchMessage({ type: 'agent/result', payload: { result: "Welcome to SeNARS Local Mode" } }), 100);
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
                    // TODO: Implement step logic if needed
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
            try {
                const results = await this.metta.run(text);
                if (results?.length) {
                    const output = results.map(r => r.toString()).join('\n');
                    const vizMatch = output.match(/__VIZ__:(\w+):(.+)/s);
                    const uiMatch = output.match(/__UI__:(\S+)(?:\s+(.+))?/);

                    if (vizMatch) {
                        const [_, type, data] = vizMatch;
                        try {
                            const parsedData = (type === 'graph' || type === 'chart') ? JSON.parse(data) : data;
                            this.dispatchMessage({
                                type: 'visualization',
                                payload: { type, data: parsedData, content: data }
                            });
                        } catch (e) {
                            console.error('Failed to parse visualization data', e);
                            this.dispatchMessage({ type: 'agent/result', payload: { result: output } });
                        }
                    } else if (uiMatch) {
                         const [_, cmd, args] = uiMatch;
                         this.dispatchMessage({
                             type: 'ui-command',
                             payload: { command: cmd, args: args ? args.trim() : '' }
                         });
                    } else {
                        this.dispatchMessage({
                            type: 'agent/result',
                            payload: { result: output }
                        });
                    }
                }
            } catch (e) {
                this.dispatchMessage({ type: 'error', payload: { message: e.message } });
            }
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

    subscribe(type, handler) {
        if (!this.messageHandlers.has(type)) this.messageHandlers.set(type, []);
        this.messageHandlers.get(type).push(handler);
    }

    unsubscribe(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (!handlers) return;
        const index = handlers.indexOf(handler);
        index > -1 && handlers.splice(index, 1);
    }

    disconnect() {
        this.connectionStatus = 'disconnected';
        this.notifyStatusChange('disconnected');
    }

    dispatchMessage(message) {
        const handlers = [...(this.messageHandlers.get(message.type) || []), ...(this.messageHandlers.get('*') || [])];
        handlers.forEach(h => { try { h(message); } catch (e) { console.error("Handler error", e); } });
    }

    updateStatus(status) {
        this.connectionStatus = status;
        this.notifyStatusChange(status);
    }

    notifyStatusChange(status) {
        this.messageHandlers.get('connection.status')?.forEach(h => h(status));
    }
}
