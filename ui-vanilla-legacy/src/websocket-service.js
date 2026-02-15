import configManager from './config/config-manager.js';
import Logger from './utils/logger.js';
import errorHandler from './utils/error-handler.js';
import MessageFormatter from './utils/message-formatter.js';
import { memoryManager } from './utils/memory-manager.js';

class WebSocketService {
    constructor(url = null, store = null) {
        // Use provided URL, or get dynamic URL
        this.url = url ?? this._getWebSocketUrl();
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = configManager.getMaxReconnectAttempts();
        this.reconnectDelay = configManager.getReconnectDelay();
        this.eventListeners = new Map();
        this.isReconnecting = false;
        this.shouldReconnect = true;
        this.store = store;
        this.sentMessageCount = 0;
        this.receivedMessageCount = 0;
        this.statusBarView = null;
        this.recentMessages = [];  // Track recent messages for debugging
        this.maxRecentMessages = 50;  // Limit to prevent memory buildup

        // Add timer tracking for memory management
        this._scheduledReconnectTimer = null;
    }

    _getWebSocketUrl() {
        // Try to use the page's current hostname instead of hardcoded localhost
        if (typeof window !== 'undefined' && window.location?.hostname) {
            return `ws://${window.location.hostname}:${configManager.getWebSocketPort()}${configManager.getWebSocketConfig().defaultPath}`;
        }
        // Fallback to config value if in non-browser environment
        return `ws://${configManager.getWebSocketConfig().defaultHost}:${configManager.getWebSocketPort()}${configManager.getWebSocketConfig().defaultPath}`;
    }

    connect() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);
                this._setupEventHandlers(resolve, reject);
            } catch (error) {
                errorHandler.handleError(error, { url: this.url, context: 'WebSocket creation' });
                reject(error);
            }
        });
    }

    _setupEventHandlers(resolve, reject) {
        // Define event handlers with structured approach
        const eventHandlers = {
            'onopen': () => {
                Logger.info('WebSocket connected', { url: this.url });
                this.reconnectAttempts = 0;
                this.isReconnecting = false;
                this._emit('open');
                resolve();
            },
            'onclose': (event) => {
                Logger.info('WebSocket closed', { code: event.code, reason: event.reason });
                this._emit('close', event);
                this._handleWebSocketClose(event);
            },
            'onerror': (error) => {
                errorHandler.handleError(error, { url: this.url, context: 'WebSocket connection' });
                this._emit('error', error);
                this._handleWebSocketError(error);
                reject(error);
            },
            'onmessage': (event) => {
                this._handleWebSocketMessage(event);
            }
        };

        // Assign handlers to websocket instance
        Object.entries(eventHandlers).forEach(([event, handler]) => {
            this.ws[event] = handler;
        });
    }

    _handleWebSocketClose(event) {
        if (this.store) {
            this.store.dispatch({ type: 'SET_ERROR', payload: `WebSocket closed: ${event.reason}` });
        }
        if (this.shouldReconnect && event.code !== 1000) {
            this._scheduleReconnect();
        }
    }

    _handleWebSocketError(error) {
        if (this.store) {
            // Provide more detailed error information
            const errorMessage = this._getDetailedErrorMessage(error);
            this.store.dispatch({
                type: 'SET_ERROR',
                payload: errorMessage
            });
        }
    }

    /**
     * Generate detailed error messages based on error type
     * @param {Error} error - The error object
     * @returns {string} Detailed error message
     */
    _getDetailedErrorMessage(error) {
        // Create a detailed error message based on different error types
        if (error.code) {
            switch (error.code) {
                case 'ECONNREFUSED':
                    return 'Connection refused - server may be down or unreachable. Check if the backend server is running.';
                case 'ENOTFOUND':
                    return 'Host not found - check network connection and server address.';
                case 'ECONNRESET':
                    return 'Connection was reset by the server. The server may have closed the connection.';
                default:
                    return `WebSocket connection error: ${error.message || error.code || 'Unknown error'}`;
            }
        } else if (error.type === 'PARSE_ERROR') {
            return `Message parsing error: Invalid message format received from server: ${error.raw || 'Unknown format'}`;
        } else {
            return `WebSocket connection error: ${error.message || 'Unknown error occurred'}`;
        }
    }

    _handleWebSocketMessage(event) {
        try {
            this.receivedMessageCount++; // Increment received message count
            const data = MessageFormatter.formatIncomingMessage(event.data);

            // Log the received message for debugging (in non-production)
            if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
                console.debug('Received WebSocket message:', data);
            }

            // Store recent messages for debugging
            this.recentMessages.push({
                timestamp: new Date(),
                message: data,
                direction: 'in'
            });

            // Keep only the most recent messages
            if (this.recentMessages.length > this.maxRecentMessages) {
                this.recentMessages = this.recentMessages.slice(-this.maxRecentMessages);
            }

            // Update status bar if available
            if (this.statusBarView) {
                this.statusBarView.updateMessageCounts(this.sentMessageCount, this.receivedMessageCount);
            }

            this._emit('message', data);
        } catch (parseError) {
            errorHandler.handleError(parseError, {
                raw: event.data,
                context: 'WebSocket message parsing'
            });
            this._emit('error', {
                type: 'PARSE_ERROR',
                message: parseError.message,
                raw: event.data
            });
        }
    }

    disconnect() {
        this.shouldReconnect = false;

        // Close WebSocket connection
        if (this.ws) {
            this.ws.close(1000, 'Client requested disconnect');
            this.ws = null;
        }

        // Clear any scheduled reconnect timer
        this._clearScheduledReconnectTimer();
    }

    reconnect() {
        this.disconnect();
        this.shouldReconnect = true;
        return this.connect();
    }

    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this._handleMaxReconnectAttempts();
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;
        const delay = this._calculateReconnectDelay();

        Logger.info('Scheduling reconnection', {
            attempt: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
            delayMs: delay
        });

        this._clearScheduledReconnectTimer();

        this._scheduledReconnectTimer = memoryManager.registerTimer(
            setTimeout(() => this._attemptReconnect(), delay)
        );
    }

    _handleMaxReconnectAttempts() {
        const error = new Error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Connection permanently lost.`);
        errorHandler.handleError(error, {
            attempts: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
            context: 'WebSocket reconnection'
        });

        if (this.store) {
            this.store.dispatch({
                type: 'SET_ERROR',
                payload: `Max reconnection attempts (${this.maxReconnectAttempts}) reached. Please check server status and try reconnecting manually.`
            });
        }

        this._emit('error', {
            type: 'MAX_RECONNECT_ATTEMPTS',
            message: error.message,
            attempts: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts
        });
    }

    _calculateReconnectDelay() {
        return Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    }

    _clearScheduledReconnectTimer() {
        if (this._scheduledReconnectTimer) {
            clearTimeout(this._scheduledReconnectTimer);
            this._scheduledReconnectTimer = null;
        }
    }

    _attemptReconnect() {
        if (this.shouldReconnect) {
            Logger.info('Attempting to reconnect');
            this.connect().catch(error => {
                errorHandler.handleError(error, { context: 'WebSocket reconnection' });
                this._scheduleReconnect();
            });
        }
        // Remove the timer reference after it executes
        this._scheduledReconnectTimer = null;
    }

    sendMessage(type, payload) {
        if (!this._isConnected()) {
            Logger.error('WebSocket not connected, cannot send message', {
                readyState: this.ws?.readyState,
                type
            });
            return false;
        }

        try {
            const message = MessageFormatter.formatOutgoingMessage(type, payload);
            this.ws.send(JSON.stringify(message));
            this.sentMessageCount++;
            this._emit('outgoingMessage', message);

            // Store sent message for debugging
            this.recentMessages.push({
                timestamp: new Date(),
                message: message,
                direction: 'out'
            });

            // Keep only the most recent messages
            if (this.recentMessages.length > this.maxRecentMessages) {
                this.recentMessages = this.recentMessages.slice(-this.maxRecentMessages);
            }

            // Update status bar if available
            if (this.statusBarView) {
                this.statusBarView.updateMessageCounts(this.sentMessageCount, this.receivedMessageCount);
            }

            return true;
        } catch (error) {
            this._handleSendMessageError(error, type, payload);
            return false;
        }
    }

    _handleSendMessageError(error, type, payload) {
        errorHandler.handleError(error, {
            type,
            payload,
            context: 'sendMessage'
        });
        this._emit('error', { type: 'SEND_ERROR', message: error.message });
    }

    sendCommand(command) {
        try {
            const message = MessageFormatter.createCommandMessage(command);
            if (!this._isConnected()) {
                Logger.error('WebSocket not connected, cannot send command', {
                    readyState: this.ws?.readyState,
                    command
                });
                return false;
            }

            this.ws.send(JSON.stringify(message));
            this._emit('outgoingMessage', message);
            return true;
        } catch (error) {
            this._handleSendCommandError(error, command);
            return false;
        }
    }

    _handleSendCommandError(error, command) {
        errorHandler.handleError(error, {
            command,
            context: 'sendCommand'
        });
        this._emit('error', { type: 'SEND_ERROR', message: error.message });
    }

    subscribe(eventType, callback) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType).push(callback);
    }

    unsubscribe(eventType, callback) {
        if (this.eventListeners.has(eventType)) {
            const listeners = this.eventListeners.get(eventType);
            const index = listeners.indexOf(callback);
            if (index > -1) listeners.splice(index, 1);
        }
    }

    _emit(eventType, data) {
        const listeners = this.eventListeners.get(eventType);
        listeners?.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                errorHandler.handleError(error, {
                    eventType,
                    context: 'WebSocket event listener'
                });
            }
        });
    }

    _isConnected() {
        return this.ws && this.ws.readyState === this.ws.OPEN;
    }

    isConnected() {
        return this._isConnected();
    }

    isConnecting() {
        return this.ws && this.ws.readyState === this.ws.CONNECTING;
    }

    isReconnecting() {
        return this.isReconnecting;
    }

    /**
     * Set reference to status bar view for updating message counts
     */
    setStatusBarView(statusBarView) {
        this.statusBarView = statusBarView;
        // Update the status bar with current counts
        if (statusBarView) {
            statusBarView.updateMessageCounts(this.sentMessageCount, this.receivedMessageCount);
        }
    }

    /**
     * Complete cleanup of the WebSocket service and all associated resources
     */
    cleanup() {
        // Disconnect the WebSocket
        this.disconnect();

        // Clear all event listeners
        this.eventListeners.clear();
    }
}

export default WebSocketService;