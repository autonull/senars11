import {ReplMessageHandler} from '../messaging/MessageHandler.js';
import {Logger} from '../../../core/src/util/Logger.js';

export class SessionServerAdapter {
    /**
     * Adapter to connect Agent/NAR instance with WebSocket Server
     * @param {Agent|NAR} agent - The agent or NAR instance
     * @param {WebSocketMonitor} websocketServer - The WebSocket monitor/server
     */
    constructor(agent, websocketServer) {
        this.agent = agent;
        this.websocketServer = websocketServer;
        this.sessions = new Map();
        this.messageHandler = new ReplMessageHandler(agent);
        this._setupEventListeners();
    }

    _setupEventListeners() {
        // Forward all events from the unified session stream to clients
        // We now trust the Agent to bridge NAR events

        const forwardedEvents = [
            // Agent/Engine Lifecycle
            'engine.ready', 'engine.quit', 'engine.reset',
            'engine.save', 'engine.load', 'engine.shutdown',

            // Execution
            'narsese.processed', 'narsese.error', 'command.error',
            'nar.cycle.step', 'nar.cycle.running', 'nar.cycle.stop',

            // Core NAR events (bridged by Agent)
            'task.input', 'task.processed', 'cycle.start', 'cycle.complete',
            'task.added', 'belief.added', 'question.answered',
            'system.started', 'system.stopped', 'system.reset', 'system.loaded',
            'reasoning.step', 'concept.created', 'task.completed', 'reasoning.derivation',

            // Logs
            'log',

            // Metrics
            'metrics.updated', 'metrics.anomaly', 'metrics.threshold_alert', 'metrics.optimization_recommendations',

            // Interactive UI & Bidirectional Communication
            'ui-command', 'agent/prompt', 'visualization'
        ];

        forwardedEvents.forEach(event => {
            this.agent.on(event, (data, options) => {
                // Some events pass multiple args, we bundle them or just take payload
                // Using 'bufferEvent' style interaction if available on monitor,
                // or broadcasting directly.

                if (this.websocketServer && typeof this.websocketServer.bufferEvent === 'function') {
                    this.websocketServer.bufferEvent(event, data, options);
                } else {
                    this._broadcastToAllClients({
                        type: event,
                        payload: data
                    });
                }
            });
        });

        const commandEvents = ['help', 'status', 'memory', 'trace', 'reset', 'save', 'load', 'demo'];
        commandEvents.forEach(cmd => {
            this.agent.on(`command.${cmd}`, (data) => {
                if (this.websocketServer && typeof this.websocketServer.bufferEvent === 'function') {
                    this.websocketServer.bufferEvent('command.output', {command: cmd, result: data.result});
                } else {
                    this._broadcastToAllClients({
                        type: 'command.output',
                        payload: {command: cmd, result: data.result}
                    });
                }
            });
        });
    }

    async handleWebSocketMessage(client, message) {
        try {
            if (!message || typeof message !== 'object') {
                throw new Error('Invalid message: expected object');
            }

            const result = await this.messageHandler.processMessage(message);
            this._sendToClient(client, result);
        } catch (error) {
            Logger.error('Error handling WebSocket message:', error);
            this._sendToClient(client, {
                type: 'error',
                payload: {error: error.message}
            });
        }
    }

    _broadcastToAllClients(message) {
        const clients = this.websocketServer?.clients;
        if (!clients) return;

        const serializedMessage = JSON.stringify(message);

        for (const client of clients) {
            if (client.readyState === client.OPEN) {
                try {
                    client.send(serializedMessage);
                } catch (error) {
                    Logger.error('Error broadcasting to client:', error);
                }
            }
        }
    }

    _sendToClient(client, message) {
        if (client && typeof client.send === 'function' && client.readyState === client.OPEN) {
            try {
                client.send(JSON.stringify(message));
            } catch (error) {
                Logger.error('Error sending to client:', error);
            }
        } else if (client && typeof client.send === 'function') {
            Logger.warn('Client not in OPEN state, readyState:', client.readyState);
        } else {
            Logger.debug('Would send to client (test mode):', message);
        }
    }

    registerWithWebSocketServer() {
        if (this.websocketServer) {
            this.websocketServer.attachReplMessageHandler(this.messageHandler);

            const supportedTypes = this.messageHandler.getSupportedMessageTypes();
            const allMessageTypes = [
                ...supportedTypes.messages,
                'reason/step',
                'narseseInput',
                'command.execute',
                ...['start', 'stop', 'step'].map(cmd => `control/${cmd}`)
            ];

            allMessageTypes.forEach(type => {
                this.websocketServer.registerClientMessageHandler(type, (message, client) =>
                    this.handleWebSocketMessage(client, message));
            });
        }
    }

    getStats() {
        return this.agent.getStats();
    }

    getBeliefs() {
        return this.agent.getBeliefs();
    }

    getHistory() {
        return this.agent.getHistory();
    }
}
