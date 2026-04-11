/**
 * Plugin Manager
 * Manages plugin lifecycle and execution
 */
import {Component} from '../composable/Component.js';
import {mergeConfig, MetricsTracker} from '../utils/index.js';

const MANAGER_DEFAULTS = {
    autoInstall: true,
    strict: false
};

/**
 * Plugin manager for lifecycle management
 */
export class PluginManager extends Component {
    constructor(config = {}) {
        super(mergeConfig(MANAGER_DEFAULTS, config));
        this.plugins = new Map();
        this.hooks = new Map();
        this.metrics = new MetricsTracker({
            pluginsInstalled: 0,
            pluginsUninstalled: 0,
            hooksExecuted: 0
        });
    }

    /**
     * Register a plugin
     * @param {Plugin} plugin - Plugin instance
     * @returns {PluginManager} Self for chaining
     */
    register(plugin) {
        this.plugins.set(plugin.config.name, plugin);

        // Register hooks
        for (const hookName of plugin.getHookNames()) {
            if (!this.hooks.has(hookName)) {
                this.hooks.set(hookName, []);
            }
            this.hooks.get(hookName).push(plugin);
        }

        this.metrics.set('pluginsInstalled', this.plugins.size);
        return this;
    }

    /**
     * Unregister a plugin
     * @param {string} name - Plugin name
     * @returns {boolean} True if unregistered
     */
    unregister(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            return false;
        }

        // Remove from hooks
        for (const [hookName, plugins] of this.hooks) {
            const idx = plugins.indexOf(plugin);
            if (idx >= 0) {
                plugins.splice(idx, 1);
            }
        }

        this.plugins.delete(name);
        this.metrics.set('pluginsInstalled', this.plugins.size);
        return true;
    }

    /**
     * Get plugin by name
     * @param {string} name - Plugin name
     * @returns {Plugin|undefined} Plugin instance
     */
    get(name) {
        return this.plugins.get(name);
    }

    /**
     * Check if plugin is registered
     * @param {string} name - Plugin name
     * @returns {boolean} True if registered
     */
    has(name) {
        return this.plugins.has(name);
    }

    /**
     * Install all plugins
     * @param {object} context - Installation context
     * @returns {Promise<object>} Installation results
     */
    async installAll(context = {}) {
        const results = {};

        for (const [name, plugin] of this.plugins) {
            if (!plugin.config.enabled) {
                continue;
            }

            try {
                results[name] = await plugin.install(context);
                this.metrics.increment('pluginsInstalled');
            } catch (error) {
                results[name] = {error: error.message};
                if (this.config.strict) {
                    throw error;
                }
            }
        }

        return results;
    }

    /**
     * Uninstall all plugins
     * @param {object} context - Uninstallation context
     * @returns {Promise<object>} Uninstallation results
     */
    async uninstallAll(context = {}) {
        const results = {};

        for (const [name, plugin] of this.plugins) {
            try {
                results[name] = await plugin.uninstall(context);
                this.metrics.increment('pluginsUninstalled');
            } catch (error) {
                results[name] = {error: error.message};
            }
        }

        return results;
    }

    /**
     * Execute a hook across all plugins
     * @param {string} hookName - Hook name
     * @param  {...any} args - Hook arguments
     * @returns {Promise<Array>} Hook results
     */
    async executeHook(hookName, ...args) {
        const plugins = this.hooks.get(hookName) || [];
        const results = [];

        for (const plugin of plugins) {
            if (!plugin.config.enabled) {
                continue;
            }

            try {
                const result = await plugin.execute(hookName, ...args);
                results.push({plugin: plugin.config.name, result, success: true});
                this.metrics.increment('hooksExecuted');
            } catch (error) {
                results.push({plugin: plugin.config.name, error: error.message, success: false});
            }
        }

        return results;
    }

    /**
     * Execute hooks in priority order
     * @param {string} hookName - Hook name
     * @param {any} input - Initial input
     * @param {object} context - Execution context
     * @returns {Promise<any>} Final result
     */
    async executeHookChain(hookName, input, context = {}) {
        let current = input;
        const plugins = this.hooks.get(hookName) || [];

        // Sort by priority
        const sorted = [...plugins].sort((a, b) => b.config.priority - a.config.priority);

        for (const plugin of sorted) {
            if (!plugin.config.enabled) {
                continue;
            }

            try {
                current = await plugin.execute(hookName, current, context);
            } catch (error) {
                if (this.config.strict) {
                    throw error;
                }
            }
        }

        return current;
    }

    /**
     * Get all registered plugins
     * @returns {Array} Plugin list
     */
    list() {
        return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
            name,
            version: plugin.config.version,
            priority: plugin.config.priority,
            enabled: plugin.config.enabled,
            hooks: plugin.getHookNames()
        }));
    }

    /**
     * Get all registered hooks
     * @returns {object} Hook registry
     */
    getHooks() {
        return Object.fromEntries(
            Array.from(this.hooks.entries()).map(([name, plugins]) => [
                name,
                plugins.map(p => p.config.name)
            ])
        );
    }

    /**
     * Clear all plugins
     * @returns {PluginManager} Self for chaining
     */
    clear() {
        this.plugins.clear();
        this.hooks.clear();
        return this;
    }

    async onShutdown() {
        await this.uninstallAll();
    }
}
