/**
 * Plugin System
 * Extensible plugin architecture with lifecycle hooks
 */
import {Component} from '../composable/Component.js';
import {mergeConfig, MetricsTracker} from '../utils/index.js';

const PLUGIN_DEFAULTS = {
    name: 'unnamed',
    version: '1.0.0',
    priority: 0,
    enabled: true,
    autoInstall: true,
    strict: false
};

/**
 * Plugin with lifecycle hooks
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
     * Check if hook exists
     * @param {string} name - Hook name
     * @returns {boolean} True if hook exists
     */
    hasHook(name) {
        return this.hooks.has(name);
    }

    /**
     * Remove a hook
     * @param {string} name - Hook name
     * @returns {boolean} True if removed
     */
    removeHook(name) {
        return this.hooks.delete(name);
    }

    /**
     * Get all hook names
     * @returns {string[]} Hook names
     */
    getHookNames() {
        return Array.from(this.hooks.keys());
    }

    /**
     * Install plugin
     * @param {object} context - Installation context
     * @returns {Promise<object>} Installation result
     */
    async install(context = {}) {
        this.metrics.increment('installsPerformed');
        this.setState('installed', true);
        this.emit('installed', {context});
        return {installed: true, plugin: this.config.name};
    }

    /**
     * Uninstall plugin
     * @param {object} context - Uninstallation context
     * @returns {Promise<object>} Uninstallation result
     */
    async uninstall(context = {}) {
        this.metrics.increment('uninstallsPerformed');
        this.setState('installed', false);
        this.emit('uninstalled', {context});
        return {uninstalled: true, plugin: this.config.name};
    }

    async onInitialize() {
        this.setState('installed', false);
    }

    /**
     * Get plugin stats
     * @returns {object} Plugin statistics
     */
    getStats() {
        return {
            hooksCount: this.hooks.size,
            installed: this.getState('installed'),
            metrics: this.metrics.getAll()
        };
    }

    /**
     * Enable plugin
     * @returns {Plugin} Self for chaining
     */
    enable() {
        this.config.enabled = true;
        return this;
    }

    /**
     * Disable plugin
     * @returns {Plugin} Self for chaining
     */
    disable() {
        this.config.enabled = false;
        return this;
    }

    /**
     * Check if plugin is enabled
     * @returns {boolean} True if enabled
     */
    isEnabled() {
        return this.config.enabled;
    }

    /**
     * Set plugin state
     * @param {string} key - State key
     * @param {any} value - State value
     * @returns {Plugin} Self for chaining
     */
    setState(key, value) {
        this.state.set(key, value);
        return this;
    }

    /**
     * Get plugin state
     * @param {string} key - State key
     * @returns {any} State value
     */
    getState(key) {
        return this.state.get(key);
    }
}
