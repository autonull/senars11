import Logger from './logger.js';
import { eventBus } from './event-bus.js';

/**
 * PluginSystem - Extensible plugin architecture for adding functionality
 */
class PluginSystem {
    constructor() {
        this.plugins = new Map();
        this.pluginStates = new Map(); // Track plugin enable/disable state
        this.hooks = new Map(); // Hook system for plugin integration points
        this.initialized = false;
    }

    // Initialize the plugin system
    async init() {
        if (this.initialized) return;
        
        // Register core hooks
        this._registerCoreHooks();
        
        this.initialized = true;
        await eventBus.emit('plugins.initialized', { timestamp: Date.now() });
    }

    // Register a new plugin
    async registerPlugin(plugin) {
        if (!plugin || !plugin.id || typeof plugin.init !== 'function') {
            throw new Error('Invalid plugin: must have id and init function');
        }

        if (this.plugins.has(plugin.id)) {
            Logger.warn(`Plugin ${plugin.id} already registered, replacing`);
        }

        try {
            // Set initial state as disabled
            this.pluginStates.set(plugin.id, 'disabled');
            
            // Register the plugin
            this.plugins.set(plugin.id, {
                ...plugin,
                state: 'registered'
            });

            // Emit plugin registered event
            await eventBus.emit('plugin.registered', {
                id: plugin.id,
                name: plugin.name,
                description: plugin.description
            });

            Logger.info(`Plugin registered: ${plugin.id}`);
        } catch (error) {
            Logger.error(`Error registering plugin ${plugin.id}`, { error: error.message });
            throw error;
        }
    }

    // Enable a plugin
    async enablePlugin(pluginId) {
        if (!this.plugins.has(pluginId)) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        const plugin = this.plugins.get(pluginId);
        
        if (this.pluginStates.get(pluginId) === 'enabled') {
            Logger.info(`Plugin ${pluginId} already enabled`);
            return true;
        }

        try {
            // Execute plugin initialization
            await plugin.init(this);
            
            // Update plugin state
            this.pluginStates.set(pluginId, 'enabled');
            plugin.state = 'enabled';
            
            // Emit plugin enabled event
            await eventBus.emit('plugin.enabled', {
                id: pluginId,
                name: plugin.name,
                timestamp: Date.now()
            });

            Logger.info(`Plugin enabled: ${pluginId}`);
            return true;
        } catch (error) {
            Logger.error(`Error enabling plugin ${pluginId}`, { error: error.message });
            this.pluginStates.set(pluginId, 'error');
            plugin.state = 'error';
            return false;
        }
    }

    // Disable a plugin
    async disablePlugin(pluginId) {
        if (!this.plugins.has(pluginId)) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        const plugin = this.plugins.get(pluginId);
        
        if (this.pluginStates.get(pluginId) === 'disabled') {
            Logger.info(`Plugin ${pluginId} already disabled`);
            return true;
        }

        try {
            // Execute plugin cleanup if it has a destroy method
            if (typeof plugin.destroy === 'function') {
                await plugin.destroy();
            }
            
            // Update plugin state
            this.pluginStates.set(pluginId, 'disabled');
            plugin.state = 'disabled';
            
            // Emit plugin disabled event
            await eventBus.emit('plugin.disabled', {
                id: pluginId,
                name: plugin.name,
                timestamp: Date.now()
            });

            Logger.info(`Plugin disabled: ${pluginId}`);
            return true;
        } catch (error) {
            Logger.error(`Error disabling plugin ${pluginId}`, { error: error.message });
            return false;
        }
    }

    // Remove a plugin
    async removePlugin(pluginId) {
        await this.disablePlugin(pluginId);
        this.plugins.delete(pluginId);
        this.pluginStates.delete(pluginId);
        
        await eventBus.emit('plugin.removed', { id: pluginId });
        Logger.info(`Plugin removed: ${pluginId}`);
    }

    // Get all plugins
    getPlugins() {
        return Array.from(this.plugins.values()).map(plugin => ({
            ...plugin,
            state: this.pluginStates.get(plugin.id)
        }));
    }

    // Get plugin by ID
    getPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        return plugin ? { ...plugin, state: this.pluginStates.get(pluginId) } : null;
    }

    // Check if plugin is enabled
    isPluginEnabled(pluginId) {
        return this.pluginStates.get(pluginId) === 'enabled';
    }

    // Register a hook
    registerHook(hookName, callback, priority = 0) {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }

        this.hooks.get(hookName).push({ callback, priority });
        
        // Sort by priority (higher priority first)
        this.hooks.get(hookName).sort((a, b) => b.priority - a.priority);
    }

    // Execute a hook
    async executeHook(hookName, ...args) {
        if (!this.hooks.has(hookName)) {
            return args[0]; // Return original value if no hooks
        }

        let result = args[0];
        const hookCallbacks = this.hooks.get(hookName);

        for (const { callback } of hookCallbacks) {
            try {
                result = await Promise.resolve(callback(result, ...args.slice(1)));
            } catch (error) {
                Logger.error(`Error in hook ${hookName}`, { error: error.message });
            }
        }

        return result;
    }

    // Load plugins from a manifest
    async loadPluginsFromManifest(manifest) {
        for (const pluginConfig of manifest.plugins || []) {
            try {
                // Dynamically import the plugin
                const module = await import(pluginConfig.path);
                const plugin = {
                    id: pluginConfig.id,
                    name: pluginConfig.name,
                    description: pluginConfig.description,
                    ...module.default
                };
                
                await this.registerPlugin(plugin);
                
                // Auto-enable if specified
                if (pluginConfig.autoEnable !== false) {
                    await this.enablePlugin(pluginConfig.id);
                }
            } catch (error) {
                Logger.error(`Error loading plugin from manifest: ${pluginConfig.id}`, { error: error.message });
            }
        }
    }

    // Internal: Register core application hooks
    _registerCoreHooks() {
        // UI rendering hooks
        this.registerHook('ui.render.start', (data) => {
            Logger.info('UI rendering started');
            return data;
        }, 100);

        this.registerHook('ui.render.complete', (data) => {
            Logger.info('UI rendering completed');
            return data;
        }, 100);

        // Data processing hooks
        this.registerHook('data.process.start', (data) => {
            Logger.info('Data processing started');
            return data;
        }, 100);

        // Graph update hooks
        this.registerHook('graph.update.start', (data) => {
            Logger.info('Graph update started');
            return data;
        }, 100);

        this.registerHook('graph.update.complete', (data) => {
            Logger.info('Graph update completed');
            return data;
        }, 100);
    }

    // Get plugin statistics
    getStats() {
        const allPlugins = this.getPlugins();
        return {
            total: allPlugins.length,
            enabled: allPlugins.filter(p => p.state === 'enabled').length,
            disabled: allPlugins.filter(p => p.state === 'disabled').length,
            error: allPlugins.filter(p => p.state === 'error').length,
            hooks: Array.from(this.hooks.keys())
        };
    }
}

// Singleton instance
const pluginSystem = new PluginSystem();

export { PluginSystem, pluginSystem };