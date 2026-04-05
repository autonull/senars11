/**
 * RL Component System
 * Leverages core/BaseComponent for unified lifecycle management
 */
import {BaseComponent, EventBus} from '@senars/core';
import {deepMergeConfig} from '../utils/ConfigHelper.js';

const COMPONENT_DEFAULTS = {
    autoInitialize: true,
    trackMetrics: true,
    enableEvents: true
};

/**
 * Component - Base class for RL components
 * Extends core/BaseComponent with RL-specific composition patterns
 */
export class Component extends BaseComponent {
    constructor(config = {}) {
        const mergedConfig = deepMergeConfig(COMPONENT_DEFAULTS, config);
        super(mergedConfig, 'RLComponent', new EventBus());

        this.parent = null;
        this.children = new Map();
        this._subscriptions = [];
        this._state = new Map();
        this._localEventListeners = new Map();
        // _metricsTracker is set by subclasses that need MetricsTracker
        // Until then, metrics getter returns the base _metrics Map
    }

    /**
     * Metrics accessor - returns MetricsTracker if set, otherwise base Map
     * For MetricsTracker usage: this.metrics = new MetricsTracker(...)
     * For Map usage: this.metrics.set(), this.metrics.get() via base _metrics
     */
    get metrics() {
        return this._metricsTracker ?? this._metrics;
    }

    set metrics(value) {
        this._metricsTracker = value;
    }

    /**
     * Initialized state accessor for backward compatibility
     * Maps to BaseComponent's _initialized
     */
    get initialized() {
        return this._initialized;
    }

    set initialized(value) {
        this._initialized = value;
    }

    static deserialize(data, registry) {
        const ComponentClass = registry.get(data.type);
        if (!ComponentClass) {
            throw new Error(`Unknown component type: ${data.type}`);
        }

        const component = new ComponentClass(data.config);
        Object.entries(data.state || {}).forEach(([key, value]) => {
            component.setState(key, value);
        });
        (data.children || []).forEach(({name, data: childData}) => {
            const child = Component.deserialize(childData, registry);
            component.add(name, child);
        });
        return component;
    }

    /**
     * Override getMetrics to integrate MetricsTracker when available
     */
    getMetrics() {
        if (this._metricsTracker && typeof this._metricsTracker.getAll === 'function') {
            return this._metricsTracker.getAll();
        }
        return super.getMetrics();
    }

    async initialize() {
        if (this.initialized) {
            return this;
        }

        await Promise.all(Array.from(this.children.values()).map(child => child.initialize()));
        await this.onInitialize();
        this._initialized = true;
        this._started = true;
        this.emit('initialized', this);
        return this;
    }

    async onInitialize() {
    }

    async shutdown() {
        await Promise.all(Array.from(this.children.values()).map(child => child.shutdown()));
        await this.onShutdown();
        this._subscriptions.forEach(sub => this.unsubscribe(sub));
        this._started = false;
        this._initialized = false;
        this._disposed = true;
        this.emit('shutdown', this);
        return this;
    }

    async onShutdown() {
    }

    add(name, component) {
        if (this.children.has(name)) {
            throw new Error(`Child component '${name}' already exists`);
        }
        component.parent = this;
        this.children.set(name, component);
        this.emit('childAdded', {name, component});
        return this;
    }

    remove(name) {
        const component = this.children.get(name);
        if (component) {
            component.parent = null;
            this.children.delete(name);
            this.emit('childRemoved', {name, component});
        }
        return this;
    }

    get(name) {
        return this.children.get(name);
    }

    has(name) {
        return this.children.has(name);
    }

    setState(key, value) {
        const prev = this._state.get(key);
        this._state.set(key, value);
        this.emit('stateChange', {key, value, prev});
        return this;
    }

    getState(key) {
        return this._state.get(key);
    }

    getAllState() {
        return new Map(this._state);
    }

    subscribe(event, callback) {
        if (!this._localEventListeners.has(event)) {
            this._localEventListeners.set(event, new Set());
        }
        this._localEventListeners.get(event).add(callback);
        const subscription = {event, callback};
        this._subscriptions.push(subscription);
        return subscription;
    }

    unsubscribe({event, callback}) {
        this._localEventListeners.get(event)?.delete(callback);
        const idx = this._subscriptions.findIndex(s => s.event === event && s.callback === callback);
        if (idx >= 0) {
            this._subscriptions.splice(idx, 1);
        }
    }

    emit(event, data) {
        this._localEventListeners.get(event)?.forEach(callback => {
            try {
                callback(data, this);
            } catch (e) {
                this.logger.error(`Error in event handler for '${event}':`, e);
            }
        });
        this.eventBus.emit(event, data);

        if (this.parent) {
            this.parent.emit(event, {source: this, data});
        }
    }

    wrapMethod(methodName, fn) {
        const self = this;
        return async function (...args) {
            const start = performance.now();
            self._metrics.calls++;

            try {
                const result = await fn.apply(this, args);
                self._metrics.totalTime += performance.now() - start;
                self._metrics.lastCallTime = performance.now() - start;
                return result;
            } catch (e) {
                self.emit('error', {method: methodName, error: e});
                throw e;
            }
        };
    }

    getMetrics() {
        if (this._metricsTracker && typeof this._metricsTracker.getAll === 'function') {
            return this._metricsTracker.getAll();
        }
        return {...this._metrics};
    }

    serialize() {
        return {
            type: this.constructor.name,
            config: this._config,
            state: Object.fromEntries(this._state),
            children: Array.from(this.children.entries()).map(([name, child]) => ({
                name,
                data: child.serialize()
            }))
        };
    }

    clone(configOverrides = {}) {
        const serialized = this.serialize();
        const config = {...serialized.config, ...configOverrides};
        const clone = new this.constructor(config);
        this._state.forEach((value, key) => {
            clone.setState(key, value);
        });
        return clone;
    }
}

/**
 * Functional component wrapper
 */
export function functionalComponent(fn, config = {}) {
    return class FunctionalComponent extends Component {
        constructor(cfg) {
            super({...config, ...cfg});
            this.fn = null;
        }

        async onInitialize() {
            if (typeof fn === 'function') {
                this.fn = fn;
            }
        }

        async call(...args) {
            if (!this.fn) {
                throw new Error('Functional component not initialized');
            }
            return this.fn(...args, this);
        }
    };
}
