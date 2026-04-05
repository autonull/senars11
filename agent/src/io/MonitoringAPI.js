import {createServer} from 'http';
import {WebSocketServer} from 'ws';

const DEFAULT_OPTIONS = Object.freeze({port: 8080, host: 'localhost'});

export class MonitoringAPI {
    constructor(nar, options = {}) {
        this.nar = nar;
        this.config = {...DEFAULT_OPTIONS, ...options};
        this.server = null;
        this.wss = null;
        this.clients = new Set();
        this.metrics = {
            cycleCount: 0,
            taskCount: 0,
            startTime: Date.now()
        };
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = createServer();
            this.wss = new WebSocketServer({server: this.server});

            this.wss.on('connection', (ws) => this._handleConnection(ws));
            this.server.listen(this.config.port, this.config.host, () => {
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    stop() {
        this.wss?.close();
        this.server?.close();
        this.clients.clear();
    }

    _handleConnection(ws) {
        this.clients.add(ws);
        this._sendInitialState(ws);

        ws.on('close', () => this.clients.delete(ws));
        ws.on('error', () => this.clients.delete(ws));
    }

    _sendInitialState(ws) {
        const initialState = {
            type: 'initial_state',
            data: {
                metrics: this.metrics,
                systemStats: this.nar.getStats(),
                memoryStats: this.nar.memory.getDetailedStats?.() || {},
                isRunning: this.nar.isRunning,
                cycleCount: this.nar.cycleCount
            },
            timestamp: Date.now()
        };
        this._sendToClient(ws, initialState);
    }

    _sendToClient(client, message) {
        if (client.readyState !== 1) {
            this.clients.delete(client);
            return;
        }

        try {
            client.send(JSON.stringify(message));
        } catch {
            this.clients.delete(client);
        }
    }

    _sendToAllClients(message) {
        this.clients.forEach(client => this._sendToClient(client, message));
    }

    getSystemMetrics() {
        return {
            ...this.metrics,
            systemStats: this.nar.getStats(),
            runtime: Date.now() - this.metrics.startTime,
            connectedClients: this.clients.size
        };
    }

    getConcepts() {
        return Array.from(this.nar.memory?.getAllConcepts?.() || []).map(concept => ({
            term: concept.term?.name || '',
            taskCount: concept.getTasksByType?.('BELIEF')?.length || 0,
            priority: concept.priority || 0,
            lastAccess: concept.lastAccess || 0
        }));
    }

    getRecentTasks(limit = 50) {
        return (this.nar.getBeliefs?.() || []).slice(-limit).map(task => ({
            term: task.term?.name || '',
            truth: task.truth?.toString() || null,
            priority: task.budget?.priority || 0,
            type: task.type
        }));
    }
}