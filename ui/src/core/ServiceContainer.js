/**
 * @file ServiceContainer.js
 * @description Dependency injection container for managing service lifecycle
 * 
 * Provides singleton pattern, service registration, and automatic dependency resolution.
 * Eliminates manual service wiring and makes testing easier through service mocking.
 * 
 * @example
 * // Register services
 * container.register('logger', Logger, { lifecycle: 'singleton' });
 * container.register('connection', ConnectionManager, {
 *   lifecycle: 'singleton',
 *   dependencies: ['logger', 'config']
 * });
 * 
 * // Resolve with automatic dependency injection
 * const connection = container.resolve('connection');
 */

export class ServiceContainer {
    static _instance = null;

    /**
     * Get singleton instance
     * @returns {ServiceContainer}
     */
    static get instance() {
        if (!ServiceContainer._instance) {
            ServiceContainer._instance = new ServiceContainer();
        }
        return ServiceContainer._instance;
    }

    constructor() {
        this._services = new Map(); // name -> service definition
        this._instances = new Map(); // name -> instance (for singletons)
        this._factories = new Map(); // name -> factory function
    }

    /**
     * Register a service
     * @param {string} name - Service name
     * @param {Function|Object} definition - Class constructor or factory function
     * @param {Object} options - Registration options
     * @param {string} options.lifecycle - 'singleton' | 'transient' | 'scoped' (default: singleton)
     * @param {string[]} options.dependencies - Array of dependency service names
     */
    register(name, definition, options = {}) {
        const {
            lifecycle = 'singleton',
            dependencies = []
        } = options;

        this._services.set(name, {
            definition,
            lifecycle,
            dependencies,
            isFactory: typeof definition === 'function' && definition.prototype === undefined
        });
    }

    /**
     * Register a factory function
     * @param {string} name - Service name
     * @param {Function} factory - Factory function(container) => instance
     * @param {Object} options - Registration options
     */
    registerFactory(name, factory, options = {}) {
        const { lifecycle = 'singleton' } = options;

        this._factories.set(name, factory);
        this._services.set(name, {
            definition: factory,
            lifecycle,
            dependencies: [],
            isFactory: true
        });
    }

    /**
     * Register an existing instance
     * @param {string} name - Service name
     * @param {Object} instance - Service instance
     */
    registerInstance(name, instance) {
        this._instances.set(name, instance);
        this._services.set(name, {
            definition: () => instance,
            lifecycle: 'singleton',
            dependencies: [],
            isFactory: true
        });
    }

    /**
     * Resolve a service by name
     * @param {string} name - Service name
     * @returns {*} Service instance
     */
    resolve(name) {
        // Check if already instantiated (singleton)
        if (this._instances.has(name)) {
            return this._instances.get(name);
        }

        const service = this._services.get(name);
        if (!service) {
            throw new Error(`Service "${name}" not registered`);
        }

        // Create instance
        const instance = this._createInstance(service);

        // Store if singleton
        if (service.lifecycle === 'singleton') {
            this._instances.set(name, instance);
        }

        return instance;
    }

    /**
     * Check if service is registered
     * @param {string} name - Service name
     * @returns {boolean}
     */
    has(name) {
        return this._services.has(name);
    }

    /**
     * Replace a service (useful for testing)
     * @param {string} name - Service name
     * @param {*} mockInstance - Mock instance
     */
    mock(name, mockInstance) {
        this._instances.set(name, mockInstance);
    }

    /**
     * Clear all instances (useful for testing)
     */
    reset() {
        this._instances.clear();
    }

    /**
     * Create service instance with dependency injection (internal)
     * @private
     */
    _createInstance(service) {
        const { definition, dependencies, isFactory } = service;

        // Resolve dependencies
        const deps = dependencies.map(depName => this.resolve(depName));

        // Create instance
        if (isFactory) {
            // Factory function
            return definition(this, ...deps);
        } else {
            // Class constructor
            return new definition(...deps);
        }
    }

    /**
     * Get list of registered service names
     * @returns {string[]}
     */
    getServiceNames() {
        return Array.from(this._services.keys());
    }
}

// Export singleton instance
export const container = ServiceContainer.instance;
