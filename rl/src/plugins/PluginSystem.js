/**
 * Neuro-Symbolic Plugin System
 * Extensible plugin architecture for custom operations.
 */
import { Component } from '../composable/Component.js';

/**
 * Base Plugin Class
 */
export class Plugin extends Component {
    constructor(config = {}) {
        super({
            name: config.name ?? 'unnamed',
            version: config.version ?? '1.0.0',
            priority: config.priority ?? 0,
            enabled: config.enabled ?? true,
            ...config
        });
        
        this.hooks = new Map();
        this.state = new Map();
    }

    /**
     * Register a hook.
     */
    hook(name, fn) {
        this.hooks.set(name, fn);
        return this;
    }

    /**
     * Execute a hook.
     */
    async execute(name, ...args) {
        const fn = this.hooks.get(name);
        return fn ? fn(...args) : args[0];
    }

    /**
     * Plugin lifecycle.
     */
    async install(context) {
        // Override in subclasses
    }

    async uninstall(context) {
        // Override in subclasses
    }

    async onInitialize() {
        this.setState('installed', false);
    }
}

/**
 * Plugin Manager
 */
export class PluginManager extends Component {
    constructor(config = {}) {
        super({
            autoInstall: config.autoInstall ?? true,
            strict: config.strict ?? false,
            ...config
        });
        
        this.plugins = new Map();
        this.hooks = new Map();
        this.context = {};
    }

    /**
     * Register a plugin.
     */
    register(name, plugin) {
        if (this.plugins.has(name) && this.config.strict) {
            throw new Error(`Plugin already registered: ${name}`);
        }
        
        this.plugins.set(name, plugin);
        
        // Register plugin hooks
        for (const [hookName, fn] of plugin.hooks) {
            if (!this.hooks.has(hookName)) {
                this.hooks.set(hookName, []);
            }
            this.hooks.get(hookName).push({ plugin: name, fn, priority: plugin.config.priority });
        }
        
        // Sort hooks by priority
        for (const hooks of this.hooks.values()) {
            hooks.sort((a, b) => b.priority - a.priority);
        }
        
        this.emit('pluginRegistered', { name, plugin });
        return this;
    }

    /**
     * Unregister a plugin.
     */
    unregister(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) return this;
        
        // Remove plugin hooks
        for (const hooks of this.hooks.values()) {
            const idx = hooks.findIndex(h => h.plugin === name);
            if (idx >= 0) hooks.splice(idx, 1);
        }
        
        this.plugins.delete(name);
        this.emit('pluginUnregistered', { name });
        return this;
    }

    /**
     * Get a plugin.
     */
    get(name) {
        return this.plugins.get(name);
    }

    /**
     * Install all plugins.
     */
    async installAll(context = {}) {
        this.context = context;
        
        for (const [name, plugin] of this.plugins) {
            if (!plugin.config.enabled) continue;
            
            try {
                await plugin.initialize();
                await plugin.install(context);
                plugin.setState('installed', true);
                this.emit('pluginInstalled', { name });
            } catch (error) {
                if (this.config.strict) {
                    throw error;
                }
                console.error(`Failed to install plugin ${name}:`, error);
            }
        }
    }

    /**
     * Uninstall all plugins.
     */
    async uninstallAll() {
        for (const [name, plugin] of this.plugins) {
            if (!plugin.getState('installed')) continue;
            
            try {
                await plugin.uninstall(this.context);
                await plugin.shutdown();
                plugin.setState('installed', false);
                this.emit('pluginUninstalled', { name });
            } catch (error) {
                console.error(`Failed to uninstall plugin ${name}:`, error);
            }
        }
    }

    /**
     * Execute hooks.
     */
    async executeHook(name, ...args) {
        const hooks = this.hooks.get(name) ?? [];
        let result = args[0];
        
        for (const { fn } of hooks) {
            result = await fn(result, ...args.slice(1));
        }
        
        return result;
    }

    /**
     * List plugins.
     */
    list() {
        return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
            name,
            version: plugin.config.version,
            enabled: plugin.config.enabled,
            installed: plugin.getState('installed') ?? false,
            hooks: Array.from(plugin.hooks.keys())
        }));
    }

    async onShutdown() {
        await this.uninstallAll();
    }
}

/**
 * Built-in Neuro-Symbolic Plugins
 */

/**
 * Symbolic Grounding Plugin
 */
export class SymbolicGroundingPlugin extends Plugin {
    constructor(config = {}) {
        super({
            name: 'symbolic-grounding',
            version: '1.0.0',
            ...config
        });
        
        this.groundingFn = config.groundingFn ?? null;
        this.liftingFn = config.liftingFn ?? null;
        
        this.hook('ground', this.ground.bind(this));
        this.hook('lift', this.lift.bind(this));
    }

    ground(tensor, context) {
        if (this.groundingFn) {
            return this.groundingFn(tensor, context);
        }
        
        // Default: extract top-k features as symbols
        const k = context?.k ?? 5;
        const indices = [...tensor.data.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, k)
            .map(([i]) => i);
        
        return indices.map(i => `feature_${i}`);
    }

    lift(symbols, context) {
        if (this.liftingFn) {
            return this.liftingFn(symbols, context);
        }
        
        // Default: one-hot encoding
        const dim = context?.dim ?? 64;
        const data = new Float32Array(dim);
        
        for (const symbol of symbols) {
            const hash = this.hashSymbol(symbol) % dim;
            data[hash] = 1;
        }
        
        return data;
    }

    hashSymbol(symbol) {
        let hash = 0;
        for (let i = 0; i < symbol.length; i++) {
            hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }
}

/**
 * Attention Plugin
 */
export class AttentionPlugin extends Plugin {
    constructor(config = {}) {
        super({
            name: 'attention',
            version: '1.0.0',
            type: config.type ?? 'self',
            heads: config.heads ?? 4,
            ...config
        });
        
        this.hook('attend', this.attend.bind(this));
        this.hook('pre-process', this.preProcess.bind(this));
        this.hook('post-process', this.postProcess.bind(this));
    }

    attend(tensor, symbols, context) {
        // Compute attention weights
        const weights = this.computeAttention(tensor, symbols);
        
        // Apply attention mask
        const attended = tensor.clone();
        for (let i = 0; i < attended.data.length; i++) {
            attended.data[i] *= weights[i] ?? 1;
        }
        
        return attended;
    }

    computeAttention(tensor, symbols) {
        const weights = new Float32Array(tensor.data.length);
        
        // Symbol-based attention
        if (symbols?.size) {
            for (const [key, { symbol, confidence }] of symbols) {
                const idx = parseInt(key);
                if (!isNaN(idx) && idx < weights.length) {
                    weights[idx] = confidence ?? 1;
                }
            }
        }
        
        // Normalize
        const sum = [...weights].reduce((a, b) => a + b, 0) || 1;
        for (let i = 0; i < weights.length; i++) {
            weights[i] /= sum;
        }
        
        return weights;
    }

    preProcess(input, context) {
        // Pre-processing: normalize input
        if (input.data) {
            const max = Math.max(...input.data, 1e-8);
            const normalized = input.clone();
            for (let i = 0; i < normalized.data.length; i++) {
                normalized.data[i] /= max;
            }
            return normalized;
        }
        return input;
    }

    postProcess(output, context) {
        // Post-processing: apply activation
        if (output.data && this.config.activation) {
            const activated = output.clone();
            for (let i = 0; i < activated.data.length; i++) {
                activated.data[i] = this.applyActivation(activated.data[i]);
            }
            return activated;
        }
        return output;
    }

    applyActivation(x) {
        switch (this.config.activation) {
            case 'relu':
                return Math.max(0, x);
            case 'sigmoid':
                return 1 / (1 + Math.exp(-x));
            case 'tanh':
                return Math.tanh(x);
            default:
                return x;
        }
    }
}

/**
 * Memory Plugin
 */
export class MemoryPlugin extends Plugin {
    constructor(config = {}) {
        super({
            name: 'memory',
            version: '1.0.0',
            capacity: config.capacity ?? 1000,
            retrieval: config.retrieval ?? 'similarity',
            ...config
        });
        
        this.memories = [];
        this.index = new Map();
        
        this.hook('store', this.store.bind(this));
        this.hook('retrieve', this.retrieve.bind(this));
        this.hook('clear', this.clear.bind(this));
    }

    store(transition, context) {
        const memory = {
            id: this.memories.length,
            transition,
            timestamp: Date.now(),
            priority: context?.priority ?? 1,
            tags: context?.tags ?? []
        };
        
        this.memories.push(memory);
        
        // Index by tags
        for (const tag of memory.tags) {
            if (!this.index.has(tag)) {
                this.index.set(tag, []);
            }
            this.index.get(tag).push(memory.id);
        }
        
        // Prune if over capacity
        if (this.memories.length > this.config.capacity) {
            this.prune();
        }
        
        return memory.id;
    }

    retrieve(query, context = {}) {
        const { k = 5, tags = null } = context;
        
        let candidates = this.memories;
        
        // Filter by tags
        if (tags) {
            const ids = new Set(tags.flatMap(t => this.index.get(t) ?? []));
            candidates = candidates.filter(m => ids.has(m.id));
        }
        
        // Sort by relevance
        switch (this.config.retrieval) {
            case 'recency':
                candidates.sort((a, b) => b.timestamp - a.timestamp);
                break;
            case 'priority':
                candidates.sort((a, b) => b.priority - a.priority);
                break;
            case 'similarity':
            default:
                candidates.sort((a, b) => 
                    this.similarity(query, b.transition) - this.similarity(query, a.transition)
                );
        }
        
        return candidates.slice(0, k);
    }

    similarity(query, transition) {
        // Simple state similarity
        const qState = query.state ?? query;
        const tState = transition.state;
        
        if (!qState || !tState) return 0;
        
        const qData = qState.data ?? qState;
        const tData = tState.data ?? tState;
        
        // Cosine similarity
        let dot = 0, normQ = 0, normT = 0;
        const len = Math.min(qData.length, tData.length);
        
        for (let i = 0; i < len; i++) {
            dot += qData[i] * tData[i];
            normQ += qData[i] * qData[i];
            normT += tData[i] * tData[i];
        }
        
        return dot / (Math.sqrt(normQ) * Math.sqrt(normT) || 1);
    }

    clear() {
        this.memories = [];
        this.index.clear();
    }

    prune() {
        // Remove lowest priority memories
        this.memories.sort((a, b) => a.priority - b.priority);
        const removed = this.memories.splice(0, Math.floor(this.config.capacity * 0.1));
        
        // Update index
        for (const memory of removed) {
            for (const tag of memory.tags) {
                const idx = this.index.get(tag)?.indexOf(memory.id);
                if (idx >= 0) this.index.get(tag).splice(idx, 1);
            }
        }
    }

    size() {
        return this.memories.length;
    }
}

/**
 * Intrinsic Motivation Plugin
 */
export class IntrinsicMotivationPlugin extends Plugin {
    constructor(config = {}) {
        super({
            name: 'intrinsic-motivation',
            version: '1.0.0',
            mode: config.mode ?? 'novelty',
            weight: config.weight ?? 0.1,
            ...config
        });
        
        this.visits = new Map();
        this.errors = [];
        
        this.hook('reward', this.computeReward.bind(this));
        this.hook('update', this.update.bind(this));
    }

    computeReward(extrinsicReward, transition, context) {
        const intrinsic = this.computeIntrinsicReward(transition);
        return extrinsicReward + this.config.weight * intrinsic;
    }

    computeIntrinsicReward(transition) {
        switch (this.config.mode) {
            case 'novelty':
                return this.noveltyReward(transition);
            case 'prediction':
                return this.predictionReward(transition);
            case 'competence':
                return this.competenceReward(transition);
            default:
                return 0;
        }
    }

    noveltyReward(transition) {
        const key = this.stateKey(transition.state);
        const count = this.visits.get(key) ?? 0;
        return 1 / Math.sqrt(count + 1);
    }

    predictionReward(transition) {
        // Reward based on prediction error (learning progress)
        if (this.errors.length === 0) return 0;
        return Math.abs(this.errors[this.errors.length - 1]);
    }

    competenceReward(transition) {
        // Reward based on goal achievement progress
        return transition.reward ?? 0;
    }

    update(transition, prediction = null) {
        // Update visit counts
        const key = this.stateKey(transition.state);
        this.visits.set(key, (this.visits.get(key) ?? 0) + 1);
        
        // Update prediction errors
        if (prediction !== null) {
            const error = Math.abs(prediction - transition.nextState);
            this.errors.push(error);
            if (this.errors.length > 100) this.errors.shift();
        }
    }

    stateKey(state) {
        if (Array.isArray(state)) {
            return state.map(x => Math.round(x * 10)).join('_');
        }
        return String(state);
    }
}

/**
 * Plugin Presets
 */
export const PluginPresets = {
    minimal: [
        new SymbolicGroundingPlugin()
    ],
    
    standard: [
        new SymbolicGroundingPlugin(),
        new AttentionPlugin({ activation: 'relu' }),
        new MemoryPlugin({ capacity: 500 })
    ],
    
    full: [
        new SymbolicGroundingPlugin(),
        new AttentionPlugin({ heads: 4, activation: 'relu' }),
        new MemoryPlugin({ capacity: 1000, retrieval: 'similarity' }),
        new IntrinsicMotivationPlugin({ mode: 'novelty', weight: 0.1 })
    ]
};
