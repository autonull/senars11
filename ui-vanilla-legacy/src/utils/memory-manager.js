/**
 * MemoryManager - Centralized memory management and cleanup utilities
 */
export class MemoryManager {
    constructor() {
        this.cleanupRegistry = new Map();
        this.objectRegistry = new WeakMap();
        this.timers = new Set();
        this.intervals = new Set();
        this.eventListeners = new Map();
    }

    /**
     * Register an object for cleanup
     * @param {string} id - Unique identifier for the resource
     * @param {Object} obj - The object to track
     * @param {Function} cleanupFn - Function to clean up the object
     */
    registerForCleanup(id, obj, cleanupFn) {
        this.cleanupRegistry.set(id, { obj, cleanupFn });
    }

    /**
     * Unregister an object from cleanup
     * @param {string} id - Unique identifier for the resource
     */
    unregisterForCleanup(id) {
        this.cleanupRegistry.delete(id);
    }

    /**
     * Register a timer for automatic cleanup
     * @param {number} timerId - Timer ID returned by setTimeout
     * @returns {number} The timer ID
     */
    registerTimer(timerId) {
        this.timers.add(timerId);
        return timerId;
    }

    /**
     * Register an interval for automatic cleanup
     * @param {number} intervalId - Interval ID returned by setInterval
     * @returns {number} The interval ID
     */
    registerInterval(intervalId) {
        this.intervals.add(intervalId);
        return intervalId;
    }

    /**
     * Cleanup a specific resource
     * @param {string} id - ID of the resource to cleanup
     */
    cleanupResource(id) {
        const resource = this.cleanupRegistry.get(id);
        if (resource && resource.cleanupFn) {
            try {
                resource.cleanupFn();
                this.cleanupRegistry.delete(id);
            } catch (error) {
                console.error(`Error cleaning up resource ${id}:`, error);
            }
        }
    }

    /**
     * Cleanup all registered resources
     */
    cleanupAll() {
        // Cleanup registered resources
        for (const [id, resource] of this.cleanupRegistry) {
            try {
                resource.cleanupFn();
            } catch (error) {
                console.error(`Error cleaning up resource ${id}:`, error);
            }
        }
        this.cleanupRegistry.clear();

        // Clear all timers
        for (const timerId of this.timers) {
            clearTimeout(timerId);
        }
        this.timers.clear();

        // Clear all intervals
        for (const intervalId of this.intervals) {
            clearInterval(intervalId);
        }
        this.intervals.clear();

        // Remove all event listeners
        this.removeAllEventListeners();
    }

    /**
     * Safely cleanup a DOM element and its children
     * @param {HTMLElement} element - The DOM element to cleanup
     */
    cleanupElement(element) {
        if (!element) return;

        // Remove all event listeners from the element
        this.removeEventListenersFromElement(element);

        // If it has children, clean them up recursively
        for (let i = element.children.length - 1; i >= 0; i--) {
            this.cleanupElement(element.children[i]);
        }

        // Remove the element from its parent
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }

    /**
     * Register an event listener for later cleanup
     * @param {EventTarget} target - The event target
     * @param {string} event - The event name
     * @param {Function} callback - The event listener function
     */
    addEventListenerForCleanup(target, event, callback) {
        const key = `${target.constructor.name}_${event}_${callback.toString().substring(0, 20)}`;
        if (!this.eventListeners.has(key)) {
            this.eventListeners.set(key, []);
        }
        
        const listenerInfo = { target, event, callback };
        this.eventListeners.get(key).push(listenerInfo);
        target.addEventListener(event, callback);
        
        return { key, listenerInfo };
    }

    /**
     * Remove a specific event listener
     * @param {string} key - The key returned by addEventListenerForCleanup
     */
    removeEventListener(key) {
        if (this.eventListeners.has(key)) {
            const listeners = this.eventListeners.get(key);
            for (const listenerInfo of listeners) {
                listenerInfo.target.removeEventListener(listenerInfo.event, listenerInfo.callback);
            }
            this.eventListeners.delete(key);
        }
    }

    /**
     * Remove all event listeners for a specific target
     * @param {EventTarget} target - The event target
     */
    removeEventListenersFromTarget(target) {
        for (const [key, listeners] of this.eventListeners) {
            const filteredListeners = listeners.filter(listener => {
                if (listener.target === target) {
                    listener.target.removeEventListener(listener.event, listener.callback);
                    return false;
                }
                return true;
            });
            
            if (filteredListeners.length === 0) {
                this.eventListeners.delete(key);
            } else {
                this.eventListeners.set(key, filteredListeners);
            }
        }
    }

    /**
     * Remove all event listeners from a DOM element and its children
     * @param {HTMLElement} element - The DOM element to cleanup
     */
    removeEventListenersFromElement(element) {
        if (!element) return;

        // Remove event listeners from this element
        for (const [key, listeners] of this.eventListeners) {
            const filteredListeners = listeners.filter(listener => {
                if (listener.target === element) {
                    element.removeEventListener(listener.event, listener.callback);
                    return false;
                }
                return true;
            });
            
            if (filteredListeners.length === 0) {
                this.eventListeners.delete(key);
            } else {
                this.eventListeners.set(key, filteredListeners);
            }
        }

        // Recursively remove from children
        for (let i = 0; i < element.children.length; i++) {
            this.removeEventListenersFromElement(element.children[i]);
        }
    }

    /**
     * Remove all registered event listeners
     */
    removeAllEventListeners() {
        for (const [key, listeners] of this.eventListeners) {
            for (const listenerInfo of listeners) {
                listenerInfo.target.removeEventListener(listenerInfo.event, listenerInfo.callback);
            }
        }
        this.eventListeners.clear();
    }

    /**
     * Track memory usage statistics
     */
    getMemoryStats() {
        return {
            registeredResources: this.cleanupRegistry.size,
            activeTimers: this.timers.size,
            activeIntervals: this.intervals.size,
            eventListeners: this.eventListeners.size
        };
    }
}

/**
 * ResourceTracker - A mixin-style class to add resource tracking to objects
 */
export class ResourceTracker {
    constructor() {
        this._trackedResources = new Map();
        this._trackedTimers = new Set();
        this._trackedIntervals = new Set();
        this._trackedListeners = new Map();
    }

    /**
     * Track a cleanup resource
     * @param {string} key - Key to identify the resource
     * @param {Function} cleanupFn - Function to clean up the resource
     */
    trackResource(key, cleanupFn) {
        this._trackedResources.set(key, cleanupFn);
    }

    /**
     * Track a timer for cleanup
     * @param {number} timerId - Timer ID
     */
    trackTimer(timerId) {
        this._trackedTimers.add(timerId);
        return timerId;
    }

    /**
     * Track an interval for cleanup
     * @param {number} intervalId - Interval ID
     */
    trackInterval(intervalId) {
        this._trackedIntervals.add(intervalId);
        return intervalId;
    }

    /**
     * Track an event listener for cleanup
     * @param {EventTarget} target - Event target
     * @param {string} event - Event name
     * @param {Function} callback - Event callback
     */
    trackEventListener(target, event, callback) {
        const key = `${event}_${callback.toString().substring(0, 20)}`;
        if (!this._trackedListeners.has(key)) {
            this._trackedListeners.set(key, []);
        }
        this._trackedListeners.get(key).push({ target, event, callback });
        target.addEventListener(event, callback);
    }

    /**
     * Cleanup all tracked resources
     */
    cleanupAllTracked() {
        // Cleanup resources
        for (const [key, cleanupFn] of this._trackedResources) {
            try {
                cleanupFn();
            } catch (error) {
                console.error(`Error cleaning up tracked resource ${key}:`, error);
            }
        }
        this._trackedResources.clear();

        // Clear timers
        for (const timerId of this._trackedTimers) {
            clearTimeout(timerId);
        }
        this._trackedTimers.clear();

        // Clear intervals
        for (const intervalId of this._trackedIntervals) {
            clearInterval(intervalId);
        }
        this._trackedIntervals.clear();

        // Remove event listeners
        for (const [key, listeners] of this._trackedListeners) {
            for (const { target, event, callback } of listeners) {
                target.removeEventListener(event, callback);
            }
        }
        this._trackedListeners.clear();
    }
}

// Global memory manager instance
export const memoryManager = new MemoryManager();