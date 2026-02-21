/**
 * Component Registry for dynamic component discovery and instantiation.
 * Supports lazy loading, versioning, and dependency injection.
 */
export class ComponentRegistry {
    constructor() {
        this.components = new Map();
        this.aliases = new Map();
        this.factories = new Map();
        this.dependencies = new Map();
        this.version = '1.0.0';
    }

    /**
     * Register a component class.
     * @param {string} name - Component name
     * @param {typeof Component} ComponentClass - Component class
     * @param {Object} options - Registration options
     */
    register(name, ComponentClass, options = {}) {
        const {
            aliases = [],
            dependencies = [],
            version = '1.0.0',
            description = '',
            factory = null,
            lazy = false
        } = options;

        this.components.set(name, {
            class: ComponentClass,
            version,
            description,
            dependencies,
            factory,
            lazy,
            registeredAt: Date.now()
        });

        for (const alias of aliases) {
            this.aliases.set(alias, name);
        }

        this.dependencies.set(name, dependencies);

        return this;
    }

    /**
     * Register a factory function for component creation.
     * @param {string} name - Component name
     * @param {Function} factory - Factory function
     */
    registerFactory(name, factory) {
        this.factories.set(name, factory);
        return this;
    }

    /**
     * Get a component class by name or alias.
     * @param {string} name - Component name or alias
     */
    get(name) {
        const resolvedName = this.aliases.get(name) || name;
        const entry = this.components.get(resolvedName);
        return entry?.class || null;
    }

    /**
     * Create a component instance.
     * @param {string} name - Component name
     * @param {Object} config - Component configuration
     * @param {Object} context - Injection context
     */
    create(name, config = {}, context = {}) {
        const resolvedName = this.aliases.get(name) || name;
        const entry = this.components.get(resolvedName);

        if (!entry) {
            throw new Error(`Component not found: ${name}`);
        }

        // Check dependencies
        for (const dep of entry.dependencies) {
            if (!this.has(dep)) {
                throw new Error(`Missing dependency: ${dep} for ${name}`);
            }
        }

        // Use factory if available
        if (entry.factory) {
            return entry.factory(config, context, this);
        }

        if (this.factories.has(resolvedName)) {
            return this.factories.get(resolvedName)(config, context, this);
        }

        // Standard instantiation
        const ComponentClass = entry.class;
        return new ComponentClass(config);
    }

    /**
     * Check if a component is registered.
     * @param {string} name - Component name
     */
    has(name) {
        return this.components.has(name) || this.aliases.has(name);
    }

    /**
     * Unregister a component.
     * @param {string} name - Component name
     */
    unregister(name) {
        const entry = this.components.get(name);
        if (entry) {
            const aliases = entry.aliases || [];
            for (const alias of aliases) {
                this.aliases.delete(alias);
            }
            this.components.delete(name);
            this.dependencies.delete(name);
        }
        return this;
    }

    /**
     * List all registered components.
     */
    list() {
        return Array.from(this.components.entries()).map(([name, entry]) => ({
            name,
            version: entry.version,
            description: entry.description,
            dependencies: entry.dependencies,
            lazy: entry.lazy
        }));
    }

    /**
     * Get component metadata.
     * @param {string} name - Component name
     */
    getMetadata(name) {
        const resolvedName = this.aliases.get(name) || name;
        return this.components.get(resolvedName) || null;
    }

    /**
     * Resolve dependencies for a component.
     * @param {string} name - Component name
     */
    resolveDependencies(name) {
        const resolved = new Set();
        const toResolve = [name];
        const result = [];

        while (toResolve.length > 0) {
            const current = toResolve.pop();
            if (resolved.has(current)) continue;

            const entry = this.components.get(current);
            if (!entry) {
                throw new Error(`Cannot resolve dependency: ${current}`);
            }

            resolved.add(current);
            result.push(current);

            for (const dep of entry.dependencies) {
                toResolve.push(dep);
            }
        }

        return result;
    }

    /**
     * Create a component with all dependencies resolved.
     * @param {string} name - Component name
     * @param {Object} config - Component configuration
     */
    createWithDependencies(name, config = {}) {
        const deps = this.resolveDependencies(name);
        const instances = new Map();

        for (const depName of deps) {
            instances.set(depName, this.create(depName, {}, { parent: name }));
        }

        const component = instances.get(name);
        
        // Inject dependencies as children
        for (const [depName, instance] of instances) {
            if (depName !== name) {
                component.add(depName, instance);
            }
        }

        return component;
    }

    /**
     * Import components from a module.
     * @param {Object} module - Module object with named exports
     * @param {Object} options - Import options
     */
    importFrom(module, options = {}) {
        const { prefix = '', suffix = '', filter = null } = options;

        for (const [name, ComponentClass] of Object.entries(module)) {
            if (typeof ComponentClass !== 'function') continue;
            if (filter && !filter(name, ComponentClass)) continue;

            const fullName = `${prefix}${name}${suffix}`;
            this.register(fullName, ComponentClass);
        }

        return this;
    }

    /**
     * Export registry to JSON.
     */
    toJSON() {
        return {
            version: this.version,
            components: this.list(),
            aliases: Array.from(this.aliases.entries()),
            factories: Array.from(this.factories.keys())
        };
    }

    /**
     * Import registry from JSON.
     * @param {Object} json - Serialized registry
     * @param {Map<string, typeof Component>} classMap - Class mapping
     */
    static fromJSON(json, classMap) {
        const registry = new ComponentRegistry();
        registry.version = json.version;

        for (const comp of json.components) {
            const ComponentClass = classMap.get(comp.name);
            if (ComponentClass) {
                registry.register(comp.name, ComponentClass, {
                    version: comp.version,
                    description: comp.description,
                    dependencies: comp.dependencies
                });
            }
        }

        return registry;
    }
}

/**
 * Global shared registry instance.
 */
export const globalRegistry = new ComponentRegistry();
