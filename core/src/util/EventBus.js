import mitt from 'mitt';
import {TraceId} from './TraceId.js';
import {Logger} from './Logger.js';

export class EventBus {
    constructor() {
        this._emitter = mitt();
        this._middleware = [];
        this._errorHandlers = new Set();
        this._stats = {eventsEmitted: 0, eventsHandled: 0, errors: 0};
        this._enabled = true;
        this._maxListeners = 10; // Prevent memory leaks
        this._concurrency = 0;
        this._maxConcurrency = 50; // Backpressure threshold
        this._maxQueueSize = 1000; // Prevent unbounded memory growth
        this._queue = [];
    }

    on(eventName, callback) {
        // Check for potential memory leak
        const currentCount = this.listenerCount(eventName);
        if (currentCount >= this._maxListeners) {
            Logger.warn(`Possible memory leak detected: ${currentCount} listeners for event "${eventName}"`);
        }

        this._emitter.on(eventName, callback);
        return this;
    }

    once(eventName, callback) {
        const onceWrapper = (data) => {
            this.off(eventName, onceWrapper);
            callback(data);
        };
        return this.on(eventName, onceWrapper);
    }

    off(eventName, callback) {
        this._emitter.off(eventName, callback);
        return this;
    }

    use(middleware) {
        if (typeof middleware !== 'function') throw new Error('Middleware must be a function');
        this._middleware.push(middleware);
        return this;
    }

    removeMiddleware(middleware) {
        const index = this._middleware.indexOf(middleware);
        if (index !== -1) this._middleware.splice(index, 1);
        return this;
    }

    onError(handler) {
        if (typeof handler === 'function') this._errorHandlers.add(handler);
        return this;
    }

    async emit(eventName, data = {}, options = {}) {
        if (!this._enabled) return;

        if (this._concurrency >= this._maxConcurrency) {
            if (this._queue.length >= this._maxQueueSize) {
                Logger.warn(`EventBus queue full (${this._maxQueueSize}), dropping event "${eventName}"`);
                return;
            }
            await new Promise(resolve => this._queue.push(resolve));
        }

        this._concurrency++;
        try {
            this._stats.eventsEmitted++;
            const traceId = options.traceId ?? TraceId.generate();
            let processedData = { ...data, eventName, traceId };

            for (const middleware of this._middleware) {
                try {
                    const result = await middleware(processedData);
                    if (result === null) return;
                    processedData = result;
                } catch (error) {
                    return this._handleError('middleware', error, { eventName, data, traceId });
                }
            }

            try {
                this._emitter.emit(eventName, processedData);
                this._stats.eventsHandled++;
            } catch (error) {
                this._stats.errors++;
                this._handleError('listener', error, { eventName, data, traceId });
            }
        } finally {
            this._concurrency--;
            const next = this._queue.shift();
            if (next) next();
        }
    }

    _handleError(type, error, context) {
        // Process error handlers
        const errorHandlers = [...this._errorHandlers]; // Create snapshot to prevent modification during iteration
        for (const handler of errorHandlers) {
            try {
                handler(error, type, context);
            } catch (handlerError) {
                Logger.error('Error in EventBus error handler:', handlerError);
            }
        }

        // Default error logging if no custom handlers
        if (errorHandlers.length === 0) {
            Logger.error(`EventBus error in ${type}:`, error, context);
        }
    }

    hasErrorHandlers() {
        return this._errorHandlers.size > 0;
    }

    getStats() {
        return {...this._stats};
    }

    clear() {
        this._emitter.all.clear();
        this._middleware = [];
        this._errorHandlers.clear();
        this._stats = {eventsEmitted: 0, eventsHandled: 0, errors: 0};
    }

    enable() {
        this._enabled = true;
    }

    disable() {
        this._enabled = false;
    }

    isEnabled() {
        return this._enabled;
    }

    hasListeners(eventName) {
        const handlers = this._emitter.all.get(eventName);
        return !!(handlers?.length || handlers?.size);
    }

    hasSubscribers(eventName) {
        return this._middleware.length > 0 ||
            this.hasListeners(eventName) ||
            this.hasListeners('*');
    }

    listenerCount(eventName) {
        const handlers = this._emitter.all.get(eventName);
        return handlers?.length || handlers?.size || 0;
    }

    // Added utility methods for better control
    setMaxListeners(maxListeners) {
        if (typeof maxListeners === 'number' && maxListeners > 0) {
            this._maxListeners = maxListeners;
        }
        return this;
    }

    getMaxListeners() {
        return this._maxListeners;
    }

    removeAllListeners(eventName) {
        if (eventName) {
            this._emitter.all.delete(eventName);
        } else {
            this._emitter.all.clear();
        }
        return this;
    }
}
