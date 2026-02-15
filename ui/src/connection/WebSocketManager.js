import { Config } from '../config/Config.js';
import { Logger } from '../logging/Logger.js';
import { WebSocketConnectionError } from '../errors/CustomErrors.js';

/**
 * WebSocketManager handles all WebSocket connections and reconnection logic
 */
export class WebSocketManager {
  constructor() {
    this.ws = null;
    this.connectionStatus = 'disconnected';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Config.getConstants().MAX_RECONNECT_ATTEMPTS;
    this.reconnectDelay = Config.getConstants().RECONNECT_DELAY;
    this.messageHandlers = new Map();
    this.logger = new Logger();
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    try {
      const wsUrl = Config.getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;
        this.logger.log('Connected to SeNARS server', 'success', '🌐');
        this._notifyStatusChange('connected');
      };

      this.ws.onclose = () => {
        this.connectionStatus = 'disconnected';
        this.logger.log('Disconnected from server', 'warning', '🔌');
        this._notifyStatusChange('disconnected');

        // Attempt to reconnect after delay, unless we've reached the max attempts
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
          this.logger.log(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`, 'error', '🚨');
        }
      };

      this.ws.onerror = (error) => {
        this.connectionStatus = 'error';
        this.logger.log('WebSocket connection error', 'error', '🚨');
        this._notifyStatusChange('error');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this._handleMessage(message);
        } catch (e) {
          this.logger.log(`Invalid message format: ${event.data}`, 'error', '🚨');
        }
      };
    } catch (error) {
      this.connectionStatus = 'error';
      this.logger.log('Failed to create WebSocket', 'error', '🚨');
      if (error instanceof WebSocketConnectionError) {
        throw error;
      } else {
        throw new WebSocketConnectionError(error.message, 'WEBSOCKET_CREATION_FAILED');
      }
    }
  }

  /**
   * Send a message through the WebSocket
   */
  sendMessage(type, payload) {
    if (this.isConnected()) {
      const message = { type, payload };
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to messages of a specific type
   */
  subscribe(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  /**
   * Unsubscribe from messages of a specific type
   */
  unsubscribe(type, handler) {
    if (this.messageHandlers.has(type)) {
      const handlers = this.messageHandlers.get(type);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus() {
    return this.connectionStatus;
  }

  /**
   * Private method to handle incoming messages
   */
  _handleMessage(message) {
    // Handle batch events
    if (message.type === 'eventBatch') {
      const events = message.data || [];
      this.logger.log(`Received batch of ${events.length} events`, 'debug', '📦');

      // Process events in batch to improve performance with many messages
      const batchLimit = Config.getConstants().MESSAGE_BATCH_SIZE;
      for (let i = 0; i < events.length; i += batchLimit) {
        const batch = events.slice(i, i + batchLimit);

        // Use requestAnimationFrame to avoid blocking the UI thread with too many messages
        const processBatch = () => {
          // Pre-allocate normalized message objects to reduce creation in loop
          for (let j = 0; j < batch.length; j++) {
            const event = batch[j];
            // Reuse existing _handleMessage method for individual events
            this._handleMessage({
              type: event.type,
              payload: event.data,
              timestamp: event.timestamp
            });
          }
        };

        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
          window.requestAnimationFrame(processBatch);
        } else {
          // Fallback for environments without requestAnimationFrame
          processBatch();
        }
      }
      return;
    }

    // Filter out noisy events
    if (message.type === 'cycle.start' || message.type === 'cycle.complete') {
      return; // Too noisy for main log
    }

    // Notify all handlers for this message type and general handlers
    // Use a more efficient approach by avoiding creating handlerTypes array repeatedly
    const specificHandlers = this.messageHandlers.get(message.type) || [];
    const generalHandlers = this.messageHandlers.get('*') || [];

    // Process specific handlers first
    for (let i = 0; i < specificHandlers.length; i++) {
      this._tryHandleMessage(specificHandlers[i], message, message.type);
    }

    // Then process general handlers
    for (let i = 0; i < generalHandlers.length; i++) {
      this._tryHandleMessage(generalHandlers[i], message, '*');
    }
  }

  /**
   * Safely execute a message handler with error handling
   */
  _tryHandleMessage(handler, message, handlerType) {
    try {
      handler(message);
    } catch (error) {
      const context = handlerType === '*' ? 'general' : `message handler for ${message.type}`;
      const errorMsg = `Error in ${context}: ${error.message}`;
      const detailedErrorMsg = `${errorMsg}. Message details: ${JSON.stringify(message, null, 2)}`;
      this.logger.log(detailedErrorMsg, 'error', '🚨');
    }
  }

  /**
   * Private method to notify status changes
   */
  _notifyStatusChange(status) {
    const statusHandlers = this.messageHandlers.get('connection.status') || [];
    statusHandlers.forEach(handler => {
      this._tryExecuteHandler(handler, status, 'status handler');
    });
  }

  /**
   * Safely execute a handler function with error context
   */
  _tryExecuteHandler(handler, arg, handlerType) {
    try {
      handler(arg);
    } catch (error) {
      const errorMsg = `Error in ${handlerType}: ${error.message}`;
      this.logger.log(errorMsg, 'error', '🚨');
      // Optionally re-throw or handle specific error types here
      console.error(`WebSocketManager ${handlerType} error:`, error);
    }
  }

  /**
   * Close the WebSocket connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}