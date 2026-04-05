import {WebSocketServer} from 'ws';
import {EventEmitter} from 'events';
import {ClientMessageHandlers} from './ClientMessageHandlers.js';
import {DEFAULT_CLIENT_CAPABILITIES, WEBSOCKET_CONFIG} from '@senars/nar';
import {generateId, Logger, sendToClient} from '@senars/core';

const DEFAULT_OPTIONS = Object.freeze({
    port: WEBSOCKET_CONFIG.defaultPort,
    host: WEBSOCKET_CONFIG.defaultHost,
    path: WEBSOCKET_CONFIG.defaultPath,
    maxConnections: WEBSOCKET_CONFIG.maxConnections,
    minBroadcastInterval: WEBSOCKET_CONFIG.minBroadcastInterval,
    messageBufferSize: WEBSOCKET_CONFIG.messageBufferSize,
    rateLimitWindowMs: WEBSOCKET_CONFIG.rateLimitWindowMs,
    maxMessagesPerWindow: WEBSOCKET_CONFIG.maxMessagesPerWindow
});

class WebSocketMonitor {
    constructor(options = {}) {
        this.port = options.port ?? DEFAULT_OPTIONS.port;
        this.host = options.host ?? DEFAULT_OPTIONS.host;
        this.path = options.path ?? DEFAULT_OPTIONS.path;
        this.maxConnections = options.maxConnections ?? DEFAULT_OPTIONS.maxConnections;
        this.minBroadcastInterval = options.minBroadcastInterval ?? DEFAULT_OPTIONS.minBroadcastInterval;
        this.eventFilter = options.eventFilter ?? null;

        this.clients = new Set();
        this.eventEmitter = new EventEmitter();
        this.server = null;
        this.clientMessageHandlers = new Map();

        this.messageHandlers = new ClientMessageHandlers(this);

        this.metrics = this._initializeMetrics();
        this.clientRateLimiters = new Map();
        this.rateLimitWindowMs = options.rateLimitWindowMs ?? DEFAULT_OPTIONS.rateLimitWindowMs;
        this.maxMessagesPerWindow = options.maxMessagesPerWindow ?? DEFAULT_OPTIONS.maxMessagesPerWindow;
        this.messageBufferSize = options.messageBufferSize ?? DEFAULT_OPTIONS.messageBufferSize;

        this.clientCapabilities = new Map();

        // Add event buffer for batching
        this.eventBuffer = [];
        this._replMessageHandler = null;
    }

    _initializeMetrics() {
        return {
            startTime: Date.now(),
            messagesSent: 0,
            messagesReceived: 0,
            errorCount: 0,
            clientConnectionCount: 0,
            clientDisconnectionCount: 0,
            broadcastPerformance: [],
            clientMessageCounts: new Map(),
            lastWindowReset: Date.now()
        };
    }

    async start() {
        this._isStopped = false;
        return new Promise((resolve, reject) => {
            this.server = new WebSocketServer({
                port: this.port,
                host: this.host,
                path: this.path,
                maxPayload: WEBSOCKET_CONFIG.maxPayload
            });

            this.server.on('connection', (ws, request) => {
                if (this.clients.size >= this.maxConnections) {
                    ws.close(1013, 'Server busy, too many connections');
                    return;
                }

                this.clients.add(ws);
                this.metrics.clientConnectionCount++;

                const clientId = this._generateClientId();
                ws.clientId = clientId;

                this.clientRateLimiters.set(clientId, {
                    messageCount: 0,
                    lastReset: Date.now()
                });

                this._sendToClient(ws, {
                    type: 'connection',
                    data: {
                        clientId,
                        timestamp: Date.now(),
                        message: 'Connected to SeNARS monitoring server',
                        serverVersion: '10.0.0',
                        capabilities: DEFAULT_CLIENT_CAPABILITIES
                    }
                });

                ws.on('message', (data) => {
                    if (!this._isClientRateLimited(clientId)) {
                        this.metrics.messagesReceived++;
                        this._handleClientMessage(ws, data);
                    } else {
                        Logger.warn(`Rate limit exceeded for client: ${clientId}`);
                        this._sendToClient(ws, {
                            type: 'error',
                            message: 'Rate limit exceeded',
                            code: 429
                        });
                    }
                });

                ws.on('close', () => {
                    this.clients.delete(ws);
                    this.clientRateLimiters.delete(clientId);
                    this.clientCapabilities.delete(clientId);
                    this.metrics.clientDisconnectionCount++;
                    this.eventEmitter.emit('clientDisconnected', {clientId, timestamp: Date.now()});
                });

                this.eventEmitter.emit('clientConnected', {clientId, timestamp: Date.now()});
            });

            this.server.on('error', (error) => {
                Logger.error('WebSocket server error:', error);
                reject(error);
            });

            this.server.on('listening', () => {
                Logger.info(`WebSocket monitoring server started on ws://${this.host}:${this.port}${this.path}`);

                this._scheduleBatch();

                resolve();
            });
        });
    }

    _scheduleBatch() {
        if (this._isStopped) {
            return;
        }

        this.batchTimer = setTimeout(() => {
            if (this._isStopped) {
                return;
            }

            if (this.eventBuffer.length > 0) {
                const batch = [...this.eventBuffer]; // Create a copy of the buffer
                this.eventBuffer = []; // Clear the buffer

                // Broadcast the batch to all connected clients
                this._broadcastToSubscribedClients({
                    type: 'eventBatch',
                    data: batch,
                    timestamp: Date.now()
                });
            }
            this._scheduleBatch();
        }, this.minBroadcastInterval);
    }

    _isClientRateLimited(clientId) {
        const now = Date.now();
        const clientLimiter = this.clientRateLimiters.get(clientId);

        if (!clientLimiter) {
            return false;
        }

        if (now - clientLimiter.lastReset > this.rateLimitWindowMs) {
            clientLimiter.messageCount = 0;
            clientLimiter.lastReset = now;
        }

        clientLimiter.messageCount++;
        return clientLimiter.messageCount > this.maxMessagesPerWindow;
    }

    async stop() {
        this._isStopped = true;
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        return new Promise((resolve) => {
            for (const client of this.clients) {
                client.close(1001, 'Server shutting down');
            }

            this.clients.clear();
            this.clientRateLimiters.clear();
            this.clientCapabilities.clear();

            if (this.server) {
                this.server.close(() => {
                    Logger.info('WebSocket monitoring server stopped');
                    resolve();
                });
            } else {
                Logger.info('WebSocket monitoring server stopped');
                resolve();
            }
        });
    }

    _sendToClient(client, message) {
        sendToClient(client, message);
    }

    _generateClientId() {
        return generateId('client');
    }

    getStats() {
        return {
            port: this.port,
            host: this.host,
            connections: this.clients.size,
            maxConnections: this.maxConnections,
            uptime: this.server ? Date.now() - this.metrics.startTime : 0,
            path: this.path,
            metrics: {
                messagesSent: this.metrics.messagesSent,
                messagesReceived: this.metrics.messagesReceived,
                errorCount: this.metrics.errorCount,
                clientConnectionCount: this.metrics.clientConnectionCount,
                clientDisconnectionCount: this.metrics.clientDisconnectionCount,
                currentClientCount: this.clients.size
            }
        };
    }

    registerClientMessageHandler(messageType, handler) {
        if (!this.clientMessageHandlers) {
            this.clientMessageHandlers = new Map();
        }
        this.clientMessageHandlers.set(messageType, handler);
    }

    _handleClientMessage(client, data) {
        try {
            const rawData = data.toString();

            if (!rawData.trim()) {
                this._sendToClient(client, {
                    type: 'error',
                    message: 'Empty message received'
                });
                return;
            }

            const message = JSON.parse(rawData);

            if (!message.type || typeof message.type !== 'string') {
                this._sendToClient(client, {
                    type: 'error',
                    message: 'Invalid message format: missing or invalid type field'
                });
                return;
            }

            const {clientId} = client;
            const clientLimiter = this.clientRateLimiters.get(clientId);
            if (clientLimiter) {
                clientLimiter.messageCount = (clientLimiter.messageCount ?? 0) + 1;
            }

            this._routeMessage(client, message);
        } catch (error) {
            this.metrics.errorCount++;
            this._handleMessageError(client, error);
        }
    }

    _routeMessage(client, message) {
        // Delegate everything to registered handlers or the attached ReplMessageHandler

        // First check custom handlers (e.g. legacy mappings)
        if (this.clientMessageHandlers.has(message.type)) {
            const handler = this.clientMessageHandlers.get(message.type);
            try {
                handler(message, client, this);
            } catch (handlerError) {
                this._sendHandlerError(client, message.type, handlerError);
            }
            return;
        }

        // Then check standard internal handlers
        const handlers = {
            'subscribe': (msg) => this.messageHandlers.handleSubscribe(client, msg),
            'unsubscribe': (msg) => this.messageHandlers.handleUnsubscribe(client, msg),
            'ping': () => this.messageHandlers.handlePing(client),
            'testLMConnection': (msg) => this.messageHandlers.handleTestLMConnection(client, msg),
            'log': (msg) => this.messageHandlers.handleLog(client, msg),
            'requestCapabilities': (msg) => this.messageHandlers.handleRequestCapabilities(client, msg)
        };

        if (handlers[message.type]) {
            handlers[message.type](message);
            return;
        }

        // If we have a ReplMessageHandler, try to let it handle unknown types
        // This handles narseseInput, control/*, etc.
        if (this._replMessageHandler) {
            this._replMessageHandler.processMessage(message)
                .then(result => {
                    // Don't send if result is void/undefined (some handlers might send directly)
                    if (result) {
                        this._sendToClient(client, result);
                    }
                })
                .catch(error => {
                    Logger.error('Error in ReplMessageHandler routing:', error);
                    this._sendToClient(client, {
                        type: 'error',
                        message: error.message
                    });
                });
        } else {
            Logger.warn(`[WEBSOCKET MONITOR] No handler found for type: ${message.type}`);
            this._sendToClient(client, {
                type: 'error',
                message: `Unknown message type: ${message.type}`
            });
            this.metrics.errorCount++;
        }
    }

    /**
     * Attach a ReplMessageHandler to this WebSocket monitor
     */
    attachReplMessageHandler(replMessageHandler) {
        this._replMessageHandler = replMessageHandler;
    }

    _handleMessageError(client, error) {
        const isSyntaxError = error instanceof SyntaxError;
        const errorMsg = isSyntaxError ? 'Invalid JSON format' : 'Error processing message';
        const errorMessage = isSyntaxError ? error.message : error.message;

        Logger.error(isSyntaxError ? 'Invalid JSON received:' : 'Error handling client message:', errorMessage);

        this._sendToClient(client, {type: 'error', message: errorMsg, error: errorMessage});
    }

    _sendHandlerError(client, messageType, handlerError) {
        Logger.error(`Error in handler for message type ${messageType}:`, handlerError);
        this._sendError(client, `Handler error for ${messageType}`, handlerError.message);
        this.metrics.errorCount++;
    }

    _sendError(client, message, error = null) {
        this._sendToClient(client, {type: 'error', message, error});
    }

    /**
     * Public API for buffering events for broadcast.
     * Allows external components (like WebRepl) to utilize the batching mechanism
     * without this class needing to know about NAR internals.
     */
    bufferEvent(eventType, data, options = {}) {
        // Filter events if an eventFilter is configured
        if (this.eventFilter && typeof this.eventFilter === 'function') {
            if (!this.eventFilter(eventType, data)) {
                return; // Skip this event if it doesn't pass the filter
            }
        }

        this.eventBuffer.push({
            type: eventType,
            data: data,
            timestamp: Date.now(),
            traceId: options.traceId
        });
    }

    _broadcastToSubscribedClients(message) {
        // Send message to all clients that are subscribed to the event type
        for (const client of this.clients) {
            // Check if the client is subscribed to 'all' or to specific event types
            const isSubscribed = !client.subscriptions || client.subscriptions.has('all') ||
                (message.type.startsWith('eventBatch') ? client.subscriptions.has('all') :
                    client.subscriptions.has(message.type) || client.subscriptions.has(message.type.split('/')[0]));

            if (isSubscribed && client.readyState === client.OPEN) {
                this._sendToClient(client, message);
                this.metrics.messagesSent++;
            }
        }
    }

    listenToNAR(nar) {
        const events = [
            'task.input',
            'task.added',
            'task.focus',
            'reasoning.derivation',
            'streamReasoner.metrics',
            'system.started',
            'system.stopped',
            'streamReasoner.step',
            'streamReasoner.error',
            'input.error',
            'reasoningState'
        ];

        events.forEach(event => {
            nar.on(event, (data, options) => {
                this.bufferEvent(event, data, options);
            });
        });

        // Enhanced ZUI Events
        nar.on('memory:concept:created', (data) => {
            // Handle both direct and wrapped payloads
            const concept = data.concept || data.payload?.concept;
            // Logger.info(`WSMonitor handling concept: ${concept?.term}`);
            if (concept) {
                this.bufferEvent('concept.created', concept);
            }
        });

        nar.on('memory:task:added', (data) => {
            const task = data.task || data.payload?.task;
            // Logger.info(`WSMonitor handling task: ${task?.term}`);
            if (task) {
                this.bufferEvent('task.added', task);
                this._checkAndEmitLink(task);
            }
        });

        nar.on('reasoning:derivation', (data) => {
            // REASONING_DERIVATION in NAR.js uses _eventBus.emit with { derivedTask, source, ... }
            // But wait, NAR.js emits with derivedTask property!
            // { derivedTask: derivation, source: ... }
            // So data.derivedTask or data.payload?.derivedTask

            // Wait, StreamReasoner also emits reasoning.derivation via legacy event?
            // IntrospectionEvents.REASONING_DERIVATION in NAR.js:
            // this._eventBus.emit(IntrospectionEvents.REASONING_DERIVATION, { derivedTask: derivation, ... })

            const task = data.task || data.payload?.task || data.derivedTask || data.payload?.derivedTask;
            if (task) {
                // Ensure derived tasks are visualized
                this.bufferEvent('task.added', task); // ZUI expects task.added for tasks
                this.bufferEvent('reasoning.derivation', task); // Keep semantic event too
                this._checkAndEmitLink(task);
            }
        });
    }

    _checkAndEmitLink(task) {
        // Extract relationships for graph visualization
        const {term} = task;
        if (!term) {
            return;
        }

        const termStr = typeof term === 'string' ? term : (term.name || term.toString());

        // Parse both <S --> P> and prefix (-->/ <->, S, P) formats
        // Note: This is a simplified parser for visualization purposes.
        // It handles atomic terms correctly but may not fully support complex NAL-3+ compound terms with nested commas.
        // A full Narsese parser should be used for robust handling in future iterations.
        let subject, copula, predicate;

        const standardMatch = termStr.match(/^<([^<>]+)\s*(-->|<->)\s*([^<>]+)>$/);
        // Improved prefix match to be slightly more permissive but still simple
        const prefixMatch = termStr.match(/^\((-->|<->),\s*(.+?),\s*(.+?)\)$/);

        if (standardMatch) {
            [subject, copula, predicate] = [standardMatch[1], standardMatch[2], standardMatch[3]];
        } else if (prefixMatch) {
            [copula, subject, predicate] = [prefixMatch[1], prefixMatch[2], prefixMatch[3]];
        }

        if (subject && predicate) {
            subject = subject.trim();
            predicate = predicate.trim();
            const type = copula === '-->' ? 'inheritance' : 'similarity';

            // IMPORTANT: Emit node creation events for endpoints first
            // This ensures nodes exist in the graph before the edge is added
            this.bufferEvent('concept.created', {term: subject});
            this.bufferEvent('concept.created', {term: predicate});

            this.bufferEvent('link.created', {
                source: subject,
                target: predicate,
                type: type,
                truth: task.truth
            });
        }
    }

    on(event, listener) {
        this.eventEmitter.on(event, listener);
    }

    off(event, listener) {
        this.eventEmitter.off(event, listener);
    }
}

export {WebSocketMonitor};
