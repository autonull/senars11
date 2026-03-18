/**
 * @file ReactiveState.js
 * @description Proxy-based reactive state management with automatic dependency tracking
 * 
 * Zero boilerplate reactive properties - no manual getters/setters needed.
 * Automatically notifies watchers on changes and updates computed properties.
 * 
 * @example
 * const state = new ReactiveState({ count: 0, name: 'test' });
 * 
 * // Watch for changes
 * state.watch('count', (newVal, oldVal) => console.log(`Count changed: ${oldVal} -> ${newVal}`));
 * 
 * // Computed properties
 * state.computed('doubled', function() { return this.count * 2; });
 * 
 * // Automatic updates
 * state.count = 5; // Triggers watchers and updates computed properties
 * console.log(state.doubled); // 10
 */

export class ReactiveState {
    /**
     * Create a reactive state object
     * @param {Object} initialState - Initial state values
     */
    constructor(initialState = {}) {
        this._state = { ...initialState };
        this._listeners = new Map(); // prop -> [callbacks]
        this._computedDeps = new Map(); // computed prop -> Set(dependencies)
        this._computedFns = new Map(); // computed prop -> function
        this._currentComputed = null; // Track which computed property is evaluating
        this._isUpdating = false; // Prevent circular updates

        const proxy = new Proxy(this, {
            get: (target, prop) => {
                // Access private properties directly from target
                if (typeof prop === 'string' && prop.startsWith('_')) {
                    return target[prop];
                }

                // Intercept method calls
                if (typeof target[prop] === 'function') {
                    // Don't bind to target, so 'this' remains the proxy
                    // enabling dependency tracking within methods
                    return target[prop];
                }

                // Track dependency for computed properties
                if (target._currentComputed) {
                    target._recordDependency(target._currentComputed, prop);
                }

                // Return state value
                return target._state[prop];
            },

            set: (target, prop, value) => {
                // Don't intercept private properties
                if (prop.startsWith('_')) {
                    target[prop] = value;
                    return true;
                }

                const oldValue = target._state[prop];

                // Only notify if value actually changed
                if (oldValue !== value) {
                    target._state[prop] = value;

                    // Notify watchers
                    target._notify(prop, value, oldValue);

                    // Update dependent computed properties
                    target._updateComputedDependents(prop);
                }

                return true;
            }
        });

        this._proxy = proxy;
        return proxy;
    }

    /**
     * Define a computed property
     * @param {string} name - Computed property name
     * @param {Function} fn - Function to compute value (receives state as context)
     */
    computed(name, fn) {
        // Clear any existing dependencies
        this._computedDeps.set(name, new Set());
        this._computedFns.set(name, fn);

        // Evaluate and track dependencies
        this._currentComputed = name;
        // Use the proxy as context to ensure property accesses are intercepted for dependency tracking
        this._state[name] = fn.call(this._proxy || this);
        this._currentComputed = null;
    }

    /**
     * Watch a property for changes
     * @param {string} prop - Property name to watch
     * @param {Function} callback - Callback(newValue, oldValue)
     * @returns {Function} Unwatch function
     */
    watch(prop, callback) {
        if (!this._listeners.has(prop)) {
            this._listeners.set(prop, []);
        }

        this._listeners.get(prop).push(callback);

        // Return unwatch function
        return () => {
            const callbacks = this._listeners.get(prop);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Watch multiple properties
     * @param {string[]} props - Array of property names
     * @param {Function} callback - Callback(changedProp, newValue, oldValue)
     * @returns {Function} Unwatch function
     */
    watchAll(props, callback) {
        const unwatchers = props.map(prop =>
            this.watch(prop, (newVal, oldVal) => callback(prop, newVal, oldVal))
        );

        // Return function to unwatch all
        return () => unwatchers.forEach(unwatch => unwatch());
    }

    /**
     * Get raw state (not reactive)
     * @returns {Object} Copy of current state
     */
    toObject() {
        return { ...this._state };
    }

    /**
     * Batch multiple updates without triggering watchers until done
     * @param {Function} fn - Function that performs updates
     */
    batch(fn) {
        this._isUpdating = true;
        const pendingUpdates = [];

        // Override notify to collect updates
        const originalNotify = this._notify;
        this._notify = (prop, newVal, oldVal) => {
            pendingUpdates.push({ prop, newVal, oldVal });
        };

        try {
            fn.call(this);
        } finally {
            // Restore original notify
            this._notify = originalNotify;
            this._isUpdating = false;

            // Trigger all pending updates
            pendingUpdates.forEach(({ prop, newVal, oldVal }) => {
                this._notify(prop, newVal, oldVal);
            });
        }
    }

    /**
     * Notify watchers of a property change (internal)
     * @private
     */
    _notify(prop, newValue, oldValue) {
        const callbacks = this._listeners.get(prop);
        if (callbacks && callbacks.length > 0) {
            callbacks.forEach(cb => {
                try {
                    cb(newValue, oldValue);
                } catch (error) {
                    console.error(`Error in watcher for "${prop}":`, error);
                }
            });
        }
    }

    /**
     * Record dependency for computed property (internal)
     * @private
     */
    _recordDependency(computedProp, dependency) {
        const deps = this._computedDeps.get(computedProp);
        if (deps) {
            deps.add(dependency);
        }
    }

    /**
     * Update computed properties that depend on changed property (internal)
     * @private
     */
    _updateComputedDependents(changedProp) {
        // Find all computed properties that depend on this property
        for (const [computedProp, deps] of this._computedDeps.entries()) {
            if (deps.has(changedProp)) {
                this._updateComputedProperty(computedProp);
            }
        }
    }

    /**
     * Recompute a computed property (internal)
     * @private
     */
    _updateComputedProperty(computedProp) {
        const fn = this._computedFns.get(computedProp);
        if (fn) {
            // Clear dependencies and re-evaluate
            this._computedDeps.set(computedProp, new Set());
            this._currentComputed = computedProp;
            const oldValue = this._state[computedProp];
            const newValue = fn.call(this._proxy || this);
            this._currentComputed = null;

            // Update if changed
            if (oldValue !== newValue) {
                this._state[computedProp] = newValue;
                this._notify(computedProp, newValue, oldValue);
                this._updateComputedDependents(computedProp);
            }
        }
    }
}
