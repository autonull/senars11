export class Component {
    constructor(config = {}) {
        this.config = { ...config };
        this.initialized = false;
        this.parent = null;
        this.children = new Map();
        this._subscriptions = [];
        this._state = new Map();
        this._metrics = { calls: 0, totalTime: 0, lastCallTime: 0 };
        this._eventListeners = new Map();
    }

    async initialize() {
        if (this.initialized) return;

        await Promise.all(Array.from(this.children.values()).map(child => child.initialize()));
        await this.onInitialize();
        this.initialized = true;
        this.emit('initialized', this);
    }

    async onInitialize() {}

    async shutdown() {
        await Promise.all(Array.from(this.children.values()).map(child => child.shutdown()));
        await this.onShutdown();

        this._subscriptions.forEach(sub => this.unsubscribe(sub));
        this.initialized = false;
        this.emit('shutdown', this);
    }

    async onShutdown() {}

    add(name, component) {
        if (this.children.has(name)) {
            throw new Error(`Child component '${name}' already exists`);
        }

        component.parent = this;
        this.children.set(name, component);
        this.emit('childAdded', { name, component });
        return this;
    }

    remove(name) {
        const component = this.children.get(name);
        if (component) {
            component.parent = null;
            this.children.delete(name);
            this.emit('childRemoved', { name, component });
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
        this.emit('stateChange', { key, value, prev });
        return this;
    }

    getState(key) {
        return this._state.get(key);
    }

    getAllState() {
        return new Map(this._state);
    }

    subscribe(event, callback) {
        if (!this._eventListeners.has(event)) {
            this._eventListeners.set(event, new Set());
        }

        this._eventListeners.get(event).add(callback);
        const subscription = { event, callback };
        this._subscriptions.push(subscription);
        return subscription;
    }

    unsubscribe({ event, callback }) {
        this._eventListeners.get(event)?.delete(callback);
        const idx = this._subscriptions.findIndex(s => s.event === event && s.callback === callback);
        if (idx >= 0) this._subscriptions.splice(idx, 1);
    }

    emit(event, data) {
        this._eventListeners.get(event)?.forEach(callback => {
            try {
                callback(data, this);
            } catch (e) {
                console.error(`Error in event handler for '${event}':`, e);
            }
        });

        if (this.parent) {
            this.parent.emit(event, { source: this, data });
        }
    }

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

    static deserialize(data, registry) {
        const ComponentClass = registry.get(data.type);
        if (!ComponentClass) {
            throw new Error(`Unknown component type: ${data.type}`);
        }

        const component = new ComponentClass(data.config);

        Object.entries(data.state || {}).forEach(([key, value]) => {
            component.setState(key, value);
        });

        (data.children || []).forEach(({ name, data: childData }) => {
            const child = Component.deserialize(childData, registry);
            component.add(name, child);
        });

        return component;
    }

    clone(configOverrides = {}) {
        const serialized = this.serialize();
        const config = { ...serialized.config, ...configOverrides };
        const clone = new this.constructor(config);

        this._state.forEach((value, key) => {
            clone.setState(key, value);
        });

        return clone;
    }
}

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
