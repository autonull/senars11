/**
 * @file EventBus.js
 * @description Centralized event system with namespacing, wildcards, and middleware
 * 
 * Provides a global event bus for loosely-coupled component communication.
 * Supports namespaced events, wildcard subscriptions, and event middleware.
 * 
 * @example
 * const bus = EventBus.instance;
 * 
 * // Subscribe to specific event
 * bus.on('user:login', (data) => console.log('User logged in:', data));
 * 
 * // Wildcard subscription
 * bus.on('user:*', (data, event) => console.log('User event:', event, data));
 * 
 * // Emit event
 * bus.emit('user:login', { userId: 123 });
 * 
 * // Middleware
 * bus.use((event, payload, next) => {
 *   console.log('Event:', event);
 *   next();
 * });
 */

export class EventBus {
    static _instance = null;

    /**
     * Get singleton instance
     * @returns {EventBus}
     */
    static get instance() {
        if (!EventBus._instance) {
            EventBus._instance = new EventBus();
        }
        return EventBus._instance;
    }

    constructor() {
        this._listeners = new Map(); // event -> [callbacks]
        this._wildcards = new Map(); // pattern -> [callbacks]
        this._middleware = []; // [middleware functions]
        this._history = []; // Event history for debugging
        this._maxHistory = 100;
        this._debugMode = false;
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name (supports wildcards: 'namespace:*')
     * @param {Function} callback - Event handler(payload, eventName)
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (event.includes('*')) {
            // Wildcard subscription
            if (!this._wildcards.has(event)) {
                this._wildcards.set(event, []);
            }
            this._wildcards.get(event).push(callback);

            return () => this._removeWildcard(event, callback);
        } else {
            // Exact match subscription
            if (!this._listeners.has(event)) {
                this._listeners.set(event, []);
            }
            this._listeners.get(event).push(callback);

            return () => this._removeListener(event, callback);
        }
    }

    /**
     * Subscribe to event, automatically unsubscribe after first trigger
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     * @returns {Function} Unsubscribe function
     */
    once(event, callback) {
        const unsubscribe = this.on(event, (...args) => {
            unsubscribe();
            callback(...args);
        });
        return unsubscribe;
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Event handler to remove
     */
    off(event, callback) {
        if (event.includes('*')) {
            this._removeWildcard(event, callback);
        } else {
            this._removeListener(event, callback);
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} payload - Event payload
     */
    emit(event, payload) {
        // Add to history if debugging
        if (this._debugMode) {
            this._addToHistory(event, payload);
        }

        // Run through middleware
        this._runMiddleware(event, payload, () => {
            // Exact match listeners
            this._notifyListeners(event, payload);

            // Wildcard listeners
            this._notifyWildcards(event, payload);
        });
    }

    /**
     * Emit event asynchronously
     * @param {string} event - Event name
     * @param {*} payload - Event payload
     * @returns {Promise}
     */
    async emitAsync(event, payload) {
        return new Promise((resolve) => {
            setTimeout(() => {
                this.emit(event, payload);
                resolve();
            }, 0);
        });
    }

    /**
     * Add middleware
     * @param {Function} middleware - Middleware function(event, payload, next)
     */
    use(middleware) {
        this._middleware.push(middleware);
    }

    /**
     * Enable debug mode (records event history)
     * @param {boolean} enabled - Enable/disable
     */
    debug(enabled = true) {
        this._debugMode = enabled;
    }

    /**
     * Get event history (if debug mode enabled)
     * @returns {Array} Event history
     */
    getHistory() {
        return [...this._history];
    }

    /**
     * Clear event history
     */
    clearHistory() {
        this._history = [];
    }

    /**
     * Remove all listeners for an event
     * @param {string} event - Event name (optional, clears all if not provided)
     */
    clear(event) {
        if (event) {
            this._listeners.delete(event);
            this._wildcards.delete(event);
        } else {
            this._listeners.clear();
            this._wildcards.clear();
        }
    }

    /**
     * Notify exact match listeners (internal)
     * @private
     */
    _notifyListeners(event, payload) {
        const callbacks = this._listeners.get(event);
        if (callbacks && callbacks.length > 0) {
            callbacks.forEach(cb => {
                try {
                    cb(payload, event);
                } catch (error) {
                    console.error(`Error in event handler for "${event}":`, error);
                }
            });
        }
    }

    /**
     * Notify wildcard listeners (internal)
     * @private
     */
    _notifyWildcards(event, payload) {
        for (const [pattern, callbacks] of this._wildcards.entries()) {
            if (this._matchesPattern(event, pattern)) {
                callbacks.forEach(cb => {
                    try {
                        cb(payload, event);
                    } catch (error) {
                        console.error(`Error in wildcard handler for "${pattern}":`, error);
                    }
                });
            }
        }
    }

    /**
     * Check if event matches wildcard pattern (internal)
     * @private
     */
    _matchesPattern(event, pattern) {
        // Convert wildcard pattern to regex
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/:/g, ':');

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(event);
    }

    /**
     * Run middleware chain (internal)
     * @private
     */
    _runMiddleware(event, payload, finalCallback) {
        let index = 0;

        const next = () => {
            if (index < this._middleware.length) {
                const middleware = this._middleware[index++];
                try {
                    middleware(event, payload, next);
                } catch (error) {
                    console.error('Error in event middleware:', error);
                    next();
                }
            } else {
                finalCallback();
            }
        };

        next();
    }

    /**
     * Remove listener (internal)
     * @private
     */
    _removeListener(event, callback) {
        const callbacks = this._listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Remove wildcard listener (internal)
     * @private
     */
    _removeWildcard(pattern, callback) {
        const callbacks = this._wildcards.get(pattern);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Add event to history (internal)
     * @private
     */
    _addToHistory(event, payload) {
        this._history.push({
            event,
            payload,
            timestamp: Date.now()
        });

        // Trim history if too long
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }
    }
}

// Export singleton instance
export const eventBus = EventBus.instance;
