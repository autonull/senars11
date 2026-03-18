/**
 * Enhanced Component
 * Extended component with middleware and validation support
 */
import { Component } from './Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const COMPOSABLE_DEFAULTS = {
    autoInitialize: true,
    trackMetrics: true,
    enableEvents: true,
    maxDepth: 10
};

/**
 * Enhanced Component with middleware and validation
 */
export class EnhancedComponent extends Component {
    constructor(config = {}) {
        super(mergeConfig(COMPOSABLE_DEFAULTS, config));
        this._metricsTracker = this.config.trackMetrics ? new MetricsTracker() : null;
        this._middleware = [];
        this._validators = [];
    }

    get metrics() {
        return this._metricsTracker;
    }

    async initialize() {
        if (this.initialized) return;

        // Run validators
        for (const validator of this._validators) {
            const valid = await validator(this);
            if (!valid) {
                throw new Error(`Component validation failed: ${this.constructor.name}`);
            }
        }

        // Initialize children
        await Promise.all(Array.from(this.children.values()).map(child => child.initialize()));

        // Run middleware (before)
        for (const mw of this._middleware) {
            if (mw.beforeInitialize) {
                await mw.beforeInitialize(this);
            }
        }

        await this.onInitialize();
        this.initialized = true;

        // Run middleware (after)
        for (const mw of this._middleware) {
            if (mw.afterInitialize) {
                await mw.afterInitialize(this);
            }
        }

        this.emit('initialized', this);
    }

    async shutdown() {
        // Run middleware (before shutdown)
        for (const mw of this._middleware) {
            if (mw.beforeShutdown) {
                await mw.beforeShutdown(this);
            }
        }

        await Promise.all(Array.from(this.children.values()).map(child => child.shutdown()));
        await this.onShutdown();

        // Run middleware (after shutdown)
        for (const mw of this._middleware) {
            if (mw.afterShutdown) {
                await mw.afterShutdown(this);
            }
        }

        this._subscriptions.forEach(sub => this.unsubscribe(sub));
        this.initialized = false;
        this.emit('shutdown', this);
    }

    /**
     * Add middleware
     * @param {object} middleware - Middleware with lifecycle hooks
     * @returns {EnhancedComponent} Self for chaining
     */
    use(middleware) {
        this._middleware.push(middleware);
        return this;
    }

    /**
     * Add validator
     * @param {Function} fn - Validation function
     * @returns {EnhancedComponent} Self for chaining
     */
    validate(fn) {
        this._validators.push(fn);
        return this;
    }

    /**
     * Set state with validation
     * @param {string} key - State key
     * @param {any} value - State value
     * @returns {EnhancedComponent} Self for chaining
     */
    setState(key, value) {
        const prev = this._state.get(key);
        this._state.set(key, value);
        this.emit('stateChange', { key, value, prev });
        return this;
    }

    /**
     * Get state with default
     * @param {string} key - State key
     * @param {any} defaultValue - Default value
     * @returns {any} State value
     */
    getState(key, defaultValue) {
        return this._state.has(key) ? this._state.get(key) : defaultValue;
    }

    /**
     * Check if state exists
     * @param {string} key - State key
     * @returns {boolean} True if state exists
     */
    hasState(key) {
        return this._state.has(key);
    }

    /**
     * Clear state
     * @param {string} key - State key (optional, clears all if omitted)
     * @returns {EnhancedComponent} Self for chaining
     */
    clearState(key) {
        if (key) {
            this._state.delete(key);
        } else {
            this._state.clear();
        }
        return this;
    }

    /**
     * Get all state
     * @returns {Map} All state
     */
    getAllState() {
        return new Map(this._state);
    }

    /**
     * Set multiple state values
     * @param {object} state - State object
     * @returns {EnhancedComponent} Self for chaining
     */
    setAllState(state) {
        Object.entries(state).forEach(([key, value]) => {
            this.setState(key, value);
        });
        return this;
    }

    /**
     * Get state snapshot
     * @returns {object} State as plain object
     */
    getStateSnapshot() {
        return Object.fromEntries(this._state);
    }

    /**
     * Restore state from snapshot
     * @param {object} snapshot - State snapshot
     * @returns {EnhancedComponent} Self for chaining
     */
    restoreState(snapshot) {
        Object.entries(snapshot).forEach(([key, value]) => {
            this.setState(key, value);
        });
        return this;
    }
}
