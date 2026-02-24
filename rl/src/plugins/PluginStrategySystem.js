/**
 * Enhanced Plugin and Strategy System
 * Unified framework for extensible plugins and strategy patterns
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const PLUGIN_DEFAULTS = {
    name: 'unnamed',
    version: '1.0.0',
    priority: 0,
    enabled: true,
    autoInstall: true,
    strict: false
};

const STRATEGY_DEFAULTS = {
    name: 'Strategy',
    epsilon: 0.1,
    decay: 0.995,
    minEpsilon: 0.01,
    temperature: 1.0,
    k: 5
};

/**
 * Enhanced Plugin with lifecycle hooks
 */
export class Plugin extends Component {
    constructor(config = {}) {
        super(mergeConfig(PLUGIN_DEFAULTS, config));
        this.hooks = new Map();
        this.state = new Map();
        this.metrics = new MetricsTracker({
            hooksExecuted: 0,
            installsPerformed: 0,
            uninstallsPerformed: 0
        });
    }

    /**
     * Register a hook
     * @param {string} name - Hook name
     * @param {Function} fn - Hook function
     * @returns {Plugin} Self for chaining
     */
    hook(name, fn) {
        this.hooks.set(name, fn);
        return this;
    }

    /**
     * Execute a hook
     * @param {string} name - Hook name
     * @param  {...any} args - Hook arguments
     * @returns {Promise<any>} Hook result
     */
    async execute(name, ...args) {
        const fn = this.hooks.get(name);
        if (fn) {
            this.metrics.increment('hooksExecuted');
            return fn(...args);
        }
        return args[0];
    }

    /**
     * Install plugin
     * @param {Object} context - Installation context
     * @returns {Promise<Object>} Installation result
     */
    async install(context = {}) {
        this.metrics.increment('installsPerformed');
        this.setState('installed', true);
        this.emit('installed', { context });
        return { installed: true, plugin: this.config.name };
    }

    /**
     * Uninstall plugin
     * @param {Object} context - Uninstallation context
     * @returns {Promise<Object>} Uninstallation result
     */
    async uninstall(context = {}) {
        this.metrics.increment('uninstallsPerformed');
        this.setState('installed', false);
        this.emit('uninstalled', { context });
        return { uninstalled: true, plugin: this.config.name };
    }

    async onInitialize() {
        this.setState('installed', false);
    }

    getStats() {
        return {
            hooksCount: this.hooks.size,
            installed: this.getState('installed'),
            metrics: this.metrics.getAll()
        };
    }
}

/**
 * Enhanced Plugin Manager
 */
export class PluginManager extends Component {
    constructor(config = {}) {
        super(mergeConfig(PLUGIN_DEFAULTS, config));
        this.plugins = new Map();
        this.hooks = new Map();
        this.context = {};
        this.metrics = new MetricsTracker({
            pluginsRegistered: 0,
            pluginsInstalled: 0,
            hooksExecuted: 0
        });
    }

    /**
     * Register a plugin
     * @param {string} name - Plugin name
     * @param {Plugin} plugin - Plugin instance
     * @returns {PluginManager} Self for chaining
     */
    register(name, plugin) {
        if (this.plugins.has(name) && this.config.strict) {
            throw new Error(`Plugin already registered: ${name}`);
        }

        this.plugins.set(name, plugin);
        this.metrics.increment('pluginsRegistered');

        plugin.hooks.forEach((fn, hookName) => {
            if (!this.hooks.has(hookName)) {
                this.hooks.set(hookName, []);
            }
            this.hooks.get(hookName).push({ 
                plugin: name, 
                fn, 
                priority: plugin.config.priority 
            });
        });

        this.hooks.forEach(hooks => hooks.sort((a, b) => b.priority - a.priority));

        this.emit('pluginRegistered', { name, plugin });
        return this;
    }

    /**
     * Unregister a plugin
     * @param {string} name - Plugin name
     * @returns {PluginManager} Self for chaining
     */
    unregister(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) return this;

        this.hooks.forEach(hooks => {
            const idx = hooks.findIndex(h => h.plugin === name);
            if (idx >= 0) hooks.splice(idx, 1);
        });

        this.plugins.delete(name);
        this.emit('pluginUnregistered', { name });
        return this;
    }

    /**
     * Get a plugin
     * @param {string} name - Plugin name
     * @returns {Plugin|null} Plugin instance
     */
    get(name) {
        return this.plugins.get(name) ?? null;
    }

    /**
     * Install all plugins
     * @param {Object} context - Installation context
     * @returns {Promise<Object>} Installation results
     */
    async installAll(context = {}) {
        this.context = context;
        const results = {};

        for (const [name, plugin] of this.plugins) {
            if (!plugin.config.enabled) continue;

            try {
                await plugin.initialize();
                await plugin.install(context);
                results[name] = { success: true };
                this.metrics.increment('pluginsInstalled');
            } catch (error) {
                results[name] = { success: false, error: error.message };
                if (this.config.strict) {
                    throw error;
                }
            }
        }

        this.emit('allInstalled', { results });
        return results;
    }

    /**
     * Uninstall all plugins
     * @param {Object} context - Uninstallation context
     * @returns {Promise<Object>} Uninstallation results
     */
    async uninstallAll(context = {}) {
        const results = {};

        for (const [name, plugin] of this.plugins) {
            try {
                await plugin.uninstall(context);
                results[name] = { success: true };
            } catch (error) {
                results[name] = { success: false, error: error.message };
            }
        }

        this.emit('allUninstalled', { results });
        return results;
    }

    /**
     * Execute a hook across all plugins
     * @param {string} hookName - Hook name
     * @param  {...any} args - Hook arguments
     * @returns {Promise<Array>} Hook results
     */
    async executeHook(hookName, ...args) {
        const hooks = this.hooks.get(hookName) ?? [];
        this.metrics.increment('hooksExecuted', hooks.length);

        const results = await Promise.all(
            hooks.map(async ({ plugin, fn }) => {
                try {
                    return { plugin, result: await fn(...args) };
                } catch (error) {
                    return { plugin, error: error.message };
                }
            })
        );

        return results;
    }

    /**
     * Get plugin statistics
     * @returns {Object} Plugin statistics
     */
    getStats() {
        return {
            pluginsCount: this.plugins.size,
            hooksCount: this.hooks.size,
            metrics: this.metrics.getAll()
        };
    }

    list() {
        return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
            name,
            version: plugin.config.version,
            enabled: plugin.config.enabled,
            installed: plugin.getState('installed')
        }));
    }
}

/**
 * Base Strategy class
 */
export class Strategy {
    constructor(config = {}) {
        this.config = mergeConfig(STRATEGY_DEFAULTS, config);
        this.name = config.name ?? this.constructor.name;
        this.metrics = new MetricsTracker({ executionsPerformed: 0 });
    }

    /**
     * Execute strategy
     * @param  {...any} args - Strategy arguments
     * @returns {*} Strategy result
     */
    execute(...args) {
        this.metrics.increment('executionsPerformed');
        throw new Error('Strategy must implement execute()');
    }

    /**
     * Check if strategy can handle given arguments
     * @param  {...any} args - Arguments to check
     * @returns {boolean} Whether strategy can handle
     */
    canHandle(...args) {
        return true;
    }

    /**
     * Create new instance with merged config
     * @param {Object} config - Config overrides
     * @returns {Strategy} New strategy instance
     */
    withConfig(config) {
        return new this.constructor({ ...this.config, ...config });
    }

    getStats() {
        return {
            name: this.name,
            metrics: this.metrics.getAll()
        };
    }
}

/**
 * Strategy Registry with priority-based selection
 */
export class StrategyRegistry {
    constructor() {
        this.strategies = new Map();
        this.defaultStrategy = null;
        this.metrics = new MetricsTracker({ selectionsPerformed: 0 });
    }

    /**
     * Register a strategy
     * @param {string} name - Strategy name
     * @param {Strategy} strategy - Strategy instance
     * @param {Object} options - Registration options
     * @returns {StrategyRegistry} Self for chaining
     */
    register(name, strategy, options = {}) {
        const { priority = 0, predicate = null } = options;
        this.strategies.set(name, { strategy, priority, predicate });
        return this;
    }

    /**
     * Set default strategy
     * @param {string} name - Strategy name
     * @returns {StrategyRegistry} Self for chaining
     */
    setDefault(name) {
        this.defaultStrategy = name;
        return this;
    }

    /**
     * Get strategy by name
     * @param {string} name - Strategy name
     * @returns {Strategy|null} Strategy instance
     */
    get(name) {
        return this.strategies.get(name)?.strategy ?? null;
    }

    /**
     * Select best strategy for given arguments
     * @param  {...any} args - Selection arguments
     * @returns {Strategy|null} Selected strategy
     */
    select(...args) {
        this.metrics.increment('selectionsPerformed');

        const candidates = Array.from(this.strategies.entries())
            .filter(([, { strategy, predicate }]) => {
                const canHandle = strategy.canHandle?.(...args) ?? true;
                const matchesPredicate = predicate?.(...args) ?? true;
                return canHandle && matchesPredicate;
            })
            .sort(([, a], [, b]) => b.priority - a.priority);

        if (candidates.length === 0) {
            return this.defaultStrategy ? this.get(this.defaultStrategy) : null;
        }

        return candidates[0][1].strategy;
    }

    /**
     * Execute strategy by name
     * @param {string} name - Strategy name
     * @param  {...any} args - Strategy arguments
     * @returns {*} Strategy result
     */
    execute(name, ...args) {
        const strategy = this.get(name);
        if (!strategy) {
            throw new Error(`Strategy not found: ${name}`);
        }
        return strategy.execute(...args);
    }

    /**
     * Execute best strategy for given arguments
     * @param  {...any} args - Strategy arguments
     * @returns {*} Strategy result
     */
    executeBest(...args) {
        const strategy = this.select(...args);
        if (!strategy) {
            throw new Error('No suitable strategy found');
        }
        return strategy.execute(...args);
    }

    /**
     * List all registered strategies
     * @returns {string[]} Strategy names
     */
    list() {
        return Array.from(this.strategies.keys());
    }

    getStats() {
        return {
            strategiesCount: this.strategies.size,
            defaultStrategy: this.defaultStrategy,
            metrics: this.metrics.getAll()
        };
    }
}

/**
 * Exploration Strategy base class
 */
export class ExplorationStrategy extends Strategy {
    select(actionValues, state = null) {
        throw new Error('Must implement select()');
    }

    execute(actionValues, state = null) {
        return this.select(actionValues, state);
    }
}

/**
 * Epsilon-Greedy exploration
 */
export class EpsilonGreedy extends ExplorationStrategy {
    constructor(config = {}) {
        super({ epsilon: 0.1, decay: 0.995, minEpsilon: 0.01, ...config });
        this.currentEpsilon = config.epsilon ?? 0.1;
    }

    select(actionValues, state = null) {
        if (Math.random() < this.currentEpsilon) {
            return Math.floor(Math.random() * actionValues.length);
        }
        return actionValues.indexOf(Math.max(...actionValues));
    }

    decay() {
        this.currentEpsilon = Math.max(this.config.minEpsilon, this.currentEpsilon * this.config.decay);
        return this.currentEpsilon;
    }

    reset() {
        this.currentEpsilon = this.config.epsilon;
        return this;
    }

    setEpsilon(epsilon) {
        this.currentEpsilon = epsilon;
        return this;
    }

    getEpsilon() {
        return this.currentEpsilon;
    }
}

/**
 * Boltzmann (Softmax) exploration
 */
export class BoltzmannExploration extends ExplorationStrategy {
    select(actionValues, state = null) {
        const { temperature = this.config.temperature } = state ?? {};
        const scaled = actionValues.map(v => v / temperature);
        const maxVal = Math.max(...scaled, -Infinity);
        const expVals = scaled.map(v => Math.exp(v - maxVal));
        const sum = expVals.reduce((a, b) => a + b, 0) || 1;
        const probs = expVals.map(e => e / sum);

        const rand = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (rand < cumsum) return i;
        }
        return probs.length - 1;
    }

    setTemperature(temp) {
        this.config.temperature = temp;
        return this;
    }

    decayTemperature(decay = 0.995, minTemp = 0.1) {
        this.config.temperature = Math.max(minTemp, this.config.temperature * decay);
        return this.config.temperature;
    }
}

/**
 * Upper Confidence Bound (UCB) exploration
 */
export class UCB extends ExplorationStrategy {
    constructor(config = {}) {
        super({ ...config, c: 2.0 });
        this.counts = new Map();
        this.values = new Map();
        this.totalCount = 0;
    }

    select(actionValues, state = null) {
        const nActions = actionValues.length;

        for (let i = 0; i < nActions; i++) {
            if (!this.counts.has(i)) {
                this.counts.set(i, 0);
                this.values.set(i, 0);
            }
        }

        for (let i = 0; i < nActions; i++) {
            if (this.counts.get(i) === 0) {
                this.counts.set(i, 1);
                this.values.set(i, actionValues[i]);
                this.totalCount++;
                return i;
            }
        }

        const ucbValues = Array.from({ length: nActions }, (_, i) => {
            const q = this.values.get(i);
            const n = this.counts.get(i);
            const exploration = this.config.c * Math.sqrt(Math.log(this.totalCount) / n);
            return q + exploration;
        });

        return ucbValues.indexOf(Math.max(...ucbValues));
    }

    update(action, reward) {
        const n = this.counts.get(action) ?? 0;
        const q = this.values.get(action) ?? 0;
        this.counts.set(action, n + 1);
        this.values.set(action, q + (reward - q) / (n + 1));
        this.totalCount++;
    }

    reset() {
        this.counts.clear();
        this.values.clear();
        this.totalCount = 0;
        return this;
    }
}

/**
 * Thompson Sampling for Bernoulli bandits
 */
export class ThompsonSampling extends ExplorationStrategy {
    constructor(config = {}) {
        super(config);
        this.successes = new Map();
        this.failures = new Map();
    }

    select(actionValues, state = null) {
        const nActions = actionValues.length;

        for (let i = 0; i < nActions; i++) {
            if (!this.successes.has(i)) {
                this.successes.set(i, 1);
                this.failures.set(i, 1);
            }
        }

        const samples = Array.from({ length: nActions }, (_, i) => 
            this._betaSample(this.successes.get(i), this.failures.get(i))
        );

        return samples.indexOf(Math.max(...samples));
    }

    _betaSample(alpha, beta) {
        const u1 = Math.random();
        const u2 = Math.random();
        const x = Math.pow(u1, 1 / alpha);
        const y = Math.pow(u2, 1 / beta);
        return x / (x + y);
    }

    update(action, reward) {
        if (reward > 0) {
            this.successes.set(action, (this.successes.get(action) ?? 1) + 1);
        } else {
            this.failures.set(action, (this.failures.get(action) ?? 1) + 1);
        }
    }

    reset() {
        this.successes.clear();
        this.failures.clear();
        return this;
    }
}

// Aliases
export { PluginManager as PluginSystem };
export { StrategyRegistry as StrategySystem };
export { ExplorationStrategy as Explore };
