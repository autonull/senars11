export class Component {
    constructor(config = {}) {
        this.config = { ...config };
        this.initialized = false;
        this.parent = null;
        this.children = new Map();
        this._subscriptions = [];
        this._state = new Map();
        this._metrics = { calls: 0, totalTime: 0, lastCallTime: 0 };
    }

    async initialize() {
        if (this.initialized) return;

        for (const child of this.children.values()) {
            await child.initialize();
        }

        await this.onInitialize();
        this.initialized = true;
        this.emit('initialized', this);
    }

    async onInitialize() {}

    async shutdown() {
        for (const child of this.children.values()) {
            await child.shutdown();
        }

        await this.onShutdown();

        for (const sub of this._subscriptions) {
            this.unsubscribe(sub);
        }

        this.initialized = false;
        this.emit('shutdown', this);
    }

    async onShutdown() {}

    /**
     * @param {string} name
     * @param {Component} component
     */
    add(name, component) {
        if (this.children.has(name)) {
            throw new Error(`Child component '${name}' already exists`);
        }

        component.parent = this;
        this.children.set(name, component);
        this.emit('childAdded', { name, component });
        return this;
    }

    /**
     * @param {string} name
     */
    remove(name) {
        const component = this.children.get(name);
        if (component) {
            component.parent = null;
            this.children.delete(name);
            this.emit('childRemoved', { name, component });
        }
        return this;
    }

    /**
     * @param {string} name
     */
    get(name) {
        return this.children.get(name);
    }

    /**
     * @param {string} name
     */
    has(name) {
        return this.children.has(name);
    }

    /**
     * @param {string} key
     * @param {*} value
     */
    setState(key, value) {
        const prev = this._state.get(key);
        this._state.set(key, value);
        this.emit('stateChange', { key, value, prev });
        return this;
    }

    /**
     * @param {string} key
     */
    getState(key) {
        return this._state.get(key);
    }

    getAllState() {
        return new Map(this._state);
    }

    /**
     * @param {string} event
     * @param {Function} callback
     */
    subscribe(event, callback) {
        if (!this._eventListeners) {
            this._eventListeners = new Map();
        }

        if (!this._eventListeners.has(event)) {
            this._eventListeners.set(event, new Set());
        }

        this._eventListeners.get(event).add(callback);
        this._subscriptions.push({ event, callback });

        return { event, callback };
    }

    /**
     * @param {Object} subscription
     */
    unsubscribe(subscription) {
        const { event, callback } = subscription;
        if (this._eventListeners?.has(event)) {
            this._eventListeners.get(event).delete(callback);
        }
        const idx = this._subscriptions.indexOf(subscription);
        if (idx >= 0) {
            this._subscriptions.splice(idx, 1);
        }
    }

    /**
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        if (this._eventListeners?.has(event)) {
            for (const callback of this._eventListeners.get(event)) {
                try {
                    callback(data, this);
                } catch (e) {
                    console.error(`Error in event handler for '${event}':`, e);
                }
            }
        }

        if (this.parent) {
            this.parent.emit(event, { source: this, data });
        }
    }

    /**
     * @param {string} methodName
     * @param {Function} fn
     */
    wrapMethod(methodName, fn) {
        const self = this;
        return async function(...args) {
            const start = performance.now();
            self._metrics.calls++;

            try {
                const result = await fn.apply(this, args);
                self._metrics.totalTime += performance.now() - start;
                self._metrics.lastCallTime = performance.now() - start;
                return result;
            } catch (e) {
                self.emit('error', { method: methodName, error: e });
                throw e;
            }
        };
    }

    getMetrics() {
        return { ...this._metrics };
    }

    serialize() {
        return {
            type: this.constructor.name,
            config: this.config,
            state: Object.fromEntries(this._state),
            children: Array.from(this.children.entries()).map(([name, child]) => ({
                name,
                data: child.serialize()
            }))
        };
    }

    /**
     * @param {Object} data
     * @param {Map<string, typeof Component>} registry
     */
    static deserialize(data, registry) {
        const ComponentClass = registry.get(data.type);
        if (!ComponentClass) {
            throw new Error(`Unknown component type: ${data.type}`);
        }

        const component = new ComponentClass(data.config);

        for (const [key, value] of Object.entries(data.state || {})) {
            component.setState(key, value);
        }

        for (const { name, data: childData } of data.children || []) {
            const child = Component.deserialize(childData, registry);
            component.add(name, child);
        }

        return component;
    }

    /**
     * @param {Object} configOverrides
     */
    clone(configOverrides = {}) {
        const serialized = this.serialize();
        const config = { ...serialized.config, ...configOverrides };
        const clone = new this.constructor(config);

        for (const [key, value] of this._state.entries()) {
            clone.setState(key, value);
        }

        return clone;
    }
}

/**
 * @param {Function} fn
 * @param {Object} config
 */
export function functionalComponent(fn, config = {}) {
    return class FunctionalComponent extends Component {
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
