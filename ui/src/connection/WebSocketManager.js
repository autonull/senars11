import { Config } from '../config/Config.js';
import { Logger } from '../logging/Logger.js';
import { WebSocketConnectionError } from '../errors/CustomErrors.js';
import { ConnectionInterface } from './ConnectionInterface.js';

export class WebSocketManager extends ConnectionInterface {
    constructor() {
        super();
        this.ws = null;
        this.connectionStatus = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = Config.getConstants().MAX_RECONNECT_ATTEMPTS;
        this.reconnectDelay = Config.getConstants().RECONNECT_DELAY;
        this.messageHandlers = new Map();
        this.logger = new Logger();
        this.eventQueue = [];
        this.isProcessingQueue = false;
        this.processSliceMs = 12;
    }

    connect(url) {
        try {
            const wsUrl = url || Config.getWebSocketUrl();
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = () => {
                this.connectionStatus = 'connected';
                this.reconnectAttempts = 0;
                this.updateHooks('connected', 'success', '🌐');
            };

            this.ws.onclose = () => {
                this.connectionStatus = 'disconnected';
                this.updateHooks('disconnected', 'warning', '🔌');
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    setTimeout(() => this.connect(), this.reconnectDelay);
                } else {
                    this.logger.log(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`, 'error', '🚨');
                }
            };

            this.ws.onerror = () => {
                this.connectionStatus = 'error';
                this.updateHooks('error', 'error', '🚨');
            };

            this.ws.onmessage = ({ data }) => {
                try { this.handleMessage(JSON.parse(data)); }
                catch (e) { this.logger.log(`Invalid message: ${data}`, 'error', '🚨'); }
            };
        } catch (error) {
            this.connectionStatus = 'error';
            this.logger.log('WS creation failed', 'error', '🚨');
            if (!(error instanceof WebSocketConnectionError)) throw new WebSocketConnectionError(error.message, 'WEBSOCKET_CREATION_FAILED');
        }
    }

    updateHooks(status, logType, icon) {
        this.logger.log(`WS ${status}`, logType, icon);
        this.notifyStatusChange(status);
    }

    sendMessage(type, payload) {
        if (!this.isConnected()) return false;
        this.ws.send(JSON.stringify({ type, payload }));
        return true;
    }

    isConnected() { return this.ws?.readyState === WebSocket.OPEN; }

    subscribe(type, handler) {
        !this.messageHandlers.has(type) && this.messageHandlers.set(type, []);
        this.messageHandlers.get(type).push(handler);
    }

    unsubscribe(type, handler) {
        const handlers = this.messageHandlers.get(type);
        const index = handlers?.indexOf(handler);
        index > -1 && handlers.splice(index, 1);
    }

    getConnectionStatus() { return this.connectionStatus; }

    handleMessage(msg) {
        if (!msg) return;
        if (msg.type === 'eventBatch') {
            const events = (msg.data ?? []).map(e => ({ type: e.type, payload: e.data, timestamp: e.timestamp }));
            this.eventQueue.push(...events);
        } else this.eventQueue.push(msg);
        this.scheduleQueueProcessing();
    }

    scheduleQueueProcessing() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;
        setTimeout(() => this.processQueue(), 0);
    }

    processQueue() {
        const start = performance.now();
        while (this.eventQueue.length) {
            if (performance.now() - start > this.processSliceMs) {
                setTimeout(() => this.processQueue(), 0);
                return;
            }
            this.dispatchMessage(this.eventQueue.shift());
        }
        this.isProcessingQueue = false;
    }

    dispatchMessage(msg) {
        if (msg.type === 'cycle.start' || msg.type === 'cycle.complete') return;
        const handlers = [...(this.messageHandlers.get(msg.type) ?? []), ...(this.messageHandlers.get('*') ?? [])];
        handlers.forEach(h => { try { h(msg); } catch (e) { console.error("WS Handler error", e); } });
    }

    notifyStatusChange(status) {
        this.messageHandlers.get('connection.status')?.forEach(h => h(status));
    }

    disconnect() { this.ws?.close(); }
}
