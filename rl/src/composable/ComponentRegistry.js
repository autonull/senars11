export class ComponentRegistry {
    constructor() {
        this.components = new Map();
        this.aliases = new Map();
        this.factories = new Map();
        this.dependencies = new Map();
        this.version = '1.0.0';
    }

    static fromJSON(json, classMap) {
        const registry = new ComponentRegistry();
        registry.version = json.version;

        json.components.forEach(comp => {
            const ComponentClass = classMap.get(comp.name);
            if (ComponentClass) {
                registry.register(comp.name, ComponentClass, {
                    version: comp.version,
                    description: comp.description,
                    dependencies: comp.dependencies
                });
            }
        });

        return registry;
    }

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

        aliases.forEach(alias => this.aliases.set(alias, name));
        this.dependencies.set(name, dependencies);

        return this;
    }

    registerFactory(name, factory) {
        this.factories.set(name, factory);
        return this;
    }

    get(name) {
        const resolvedName = this.aliases.get(name) || name;
        return this.components.get(resolvedName)?.class || null;
    }

    create(name, config = {}, context = {}) {
        const resolvedName = this.aliases.get(name) || name;
        const entry = this.components.get(resolvedName);

        if (!entry) {
            throw new Error(`Component not found: ${name}`);
        }

        for (const dep of entry.dependencies) {
            if (!this.has(dep)) {
                throw new Error(`Missing dependency: ${dep} for ${name}`);
            }
        }

        if (entry.factory) {
            return entry.factory(config, context, this);
        }
        if (this.factories.has(resolvedName)) {
            return this.factories.get(resolvedName)(config, context, this);
        }

        return new entry.class(config);
    }

    has(name) {
        return this.components.has(name) || this.aliases.has(name);
    }

    unregister(name) {
        const entry = this.components.get(name);
        if (entry) {
            const aliases = entry.aliases || [];
            aliases.forEach(alias => this.aliases.delete(alias));
            this.components.delete(name);
            this.dependencies.delete(name);
        }
        return this;
    }

    list() {
        return Array.from(this.components.entries()).map(([name, entry]) => ({
            name,
            version: entry.version,
            description: entry.description,
            dependencies: entry.dependencies,
            lazy: entry.lazy
        }));
    }

    getMetadata(name) {
        const resolvedName = this.aliases.get(name) || name;
        return this.components.get(resolvedName) || null;
    }

    resolveDependencies(name) {
        const resolved = new Set();
        const toResolve = [name];
        const result = [];

        while (toResolve.length > 0) {
            const current = toResolve.pop();
            if (resolved.has(current)) {
                continue;
            }

            const entry = this.components.get(current);
            if (!entry) {
                throw new Error(`Cannot resolve dependency: ${current}`);
            }

            resolved.add(current);
            result.push(current);

            entry.dependencies.forEach(dep => toResolve.push(dep));
        }

        return result;
    }

    createWithDependencies(name, config = {}) {
        const deps = this.resolveDependencies(name);
        const instances = new Map();

        deps.forEach(depName => {
            instances.set(depName, this.create(depName, {}, {parent: name}));
        });

        const component = instances.get(name);

        instances.forEach((instance, depName) => {
            if (depName !== name) {
                component.add(depName, instance);
            }
        });

        return component;
    }

    importFrom(module, options = {}) {
        const {prefix = '', suffix = '', filter = null} = options;

        Object.entries(module).forEach(([name, ComponentClass]) => {
            if (typeof ComponentClass !== 'function') {
                return;
            }
            if (filter && !filter(name, ComponentClass)) {
                return;
            }

            const fullName = `${prefix}${name}${suffix}`;
            this.register(fullName, ComponentClass);
        });

        return this;
    }

    toJSON() {
        return {
            version: this.version,
            components: this.list(),
            aliases: Array.from(this.aliases.entries()),
            factories: Array.from(this.factories.keys())
        };
    }
}

export const globalRegistry = new ComponentRegistry();
