/**
 * @file decorators.js
 * @description Component decorators to eliminate boilerplate
 * 
 * Provides decorators for dependency injection, auto-binding, and event handling.
 * Note: These use a function-based approach since JavaScript doesn't have
 * native decorator syntax yet (Stage 3 proposal).
 * 
 * @example
 * // Dependency injection
 * class MyComponent extends Component {
 *   static $inject = ['logger', 'connection'];
 *   
 *   constructor(logger, connection) {
 *     super();
 *     this.logger = logger;
 *     this.connection = connection;
 *   }
 * }
 * 
 * // Auto-bind all methods
 * autobind(MyComponent);
 * 
 * // Event handlers with automatic cleanup
 * defineEventHandlers(MyComponent, {
 *   'click .button': 'handleButtonClick',
 *   'submit form': 'handleFormSubmit'
 * });
 */

/**
 * Mark a class as injectable with dependencies
 * @param {string[]} dependencies - Array of service names to inject
 * @returns {Function} Decorator function
 */
export function inject(...dependencies) {
    return function (target) {
        target.$inject = dependencies;
        target.prototype.$inject = dependencies;
        return target;
    };
}

/**
 * Auto-bind all methods to instance (eliminates need for .bind(this))
 * @param {Function} target - Class constructor
 * @returns {Function} Modified constructor
 */
export function autobind(target) {
    const prototype = target.prototype;
    const propertyNames = Object.getOwnPropertyNames(prototype);

    propertyNames.forEach(name => {
        if (name === 'constructor') return;

        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (!descriptor || typeof descriptor.value !== 'function') return;

        const originalMethod = descriptor.value;

        descriptor.value = function (...args) {
            return originalMethod.apply(this, args);
        };

        Object.defineProperty(prototype, name, descriptor);
    });

    // Also bind in constructor
    const originalConstructor = target;
    const newConstructor = function (...args) {
        const instance = new originalConstructor(...args);

        propertyNames.forEach(name => {
            if (name === 'constructor') return;
            if (typeof instance[name] === 'function') {
                instance[name] = instance[name].bind(instance);
            }
        });

        return instance;
    };

    // Preserve prototype
    newConstructor.prototype = originalConstructor.prototype;
    Object.setPrototypeOf(newConstructor, originalConstructor);

    return newConstructor;
}

/**
 * Define event handlers declaratively
 * @param {Function} target - Class constructor
 * @param {Object} handlers - Map of 'event selector' -> 'methodName'
 */
export function defineEventHandlers(target, handlers) {
    target.prototype.$eventHandlers = handlers;

    // Add setup method to install handlers
    const originalInit = target.prototype.initialize;
    target.prototype.initialize = function () {
        // Call original initialize if it exists
        if (originalInit) {
            originalInit.call(this);
        }

        // Install event handlers
        this._installedHandlers = [];

        for (const [eventSpec, methodName] of Object.entries(handlers)) {
            const [event, selector] = eventSpec.split(' ');
            const method = this[methodName];

            if (!method) {
                console.warn(`Method ${methodName} not found on component`);
                continue;
            }

            const boundMethod = method.bind(this);

            if (selector) {
                // Delegated event (e.g., 'click .button')
                const elements = this.container?.querySelectorAll(selector) || [];
                elements.forEach(el => {
                    el.addEventListener(event, boundMethod);
                    this._installedHandlers.push({ el, event, handler: boundMethod });
                });
            } else {
                // Direct event on container
                if (this.container) {
                    this.container.addEventListener(event, boundMethod);
                    this._installedHandlers.push({
                        el: this.container,
                        event,
                        handler: boundMethod
                    });
                }
            }
        }
    };

    // Add cleanup method
    const originalDestroy = target.prototype.destroy;
    target.prototype.destroy = function () {
        // Remove event handlers
        if (this._installedHandlers) {
            this._installedHandlers.forEach(({ el, event, handler }) => {
                el.removeEventListener(event, handler);
            });
            this._installedHandlers = [];
        }

        // Call original destroy if it exists
        if (originalDestroy) {
            originalDestroy.call(this);
        }
    };
}

/**
 * Mixin composer - merge multiple classes/objects
 * @param {...Function|Object} mixins - Classes or objects to mix in
 * @returns {Function} Decorator function
 */
export function mixin(...mixins) {
    return function (target) {
        mixins.forEach(mixin => {
            const source = typeof mixin === 'function' ? mixin.prototype : mixin;

            Object.getOwnPropertyNames(source).forEach(name => {
                if (name === 'constructor') return;

                const descriptor = Object.getOwnPropertyDescriptor(source, name);
                Object.defineProperty(target.prototype, name, descriptor);
            });
        });

        return target;
    };
}

/**
 * Debounce decorator - debounce method calls
 * @param {number} wait - Milliseconds to wait
 * @param {Object} options - Debounce options
 * @returns {Function} Method decorator
 */
export function debounce(wait, options = {}) {
    const { leading = false, trailing = true } = options;

    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        let timeout;

        descriptor.value = function (...args) {
            const later = () => {
                timeout = null;
                if (trailing) {
                    originalMethod.apply(this, args);
                }
            };

            const callNow = leading && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);

            if (callNow) {
                originalMethod.apply(this, args);
            }
        };

        return descriptor;
    };
}

/**
 * Throttle decorator - throttle method calls
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Method decorator
 */
export function throttle(wait) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        let lastCall = 0;

        descriptor.value = function (...args) {
            const now = Date.now();
            if (now - lastCall >= wait) {
                lastCall = now;
                originalMethod.apply(this, args);
            }
        };

        return descriptor;
    };
}

/**
 * Memoize decorator - cache method results
 * @param {Function} keyGenerator - Function to generate cache key from args
 * @returns {Function} Method decorator
 */
export function memoize(keyGenerator = JSON.stringify) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const cache = new Map();

        descriptor.value = function (...args) {
            const key = keyGenerator(args);

            if (cache.has(key)) {
                return cache.get(key);
            }

            const result = originalMethod.apply(this, args);
            cache.set(key, result);
            return result;
        };

        return descriptor;
    };
}

/**
 * Validate decorator - validate method arguments
 * @param {Object} schema - Validation schema { argIndex: validatorFn }
 * @returns {Function} Method decorator
 */
export function validate(schema) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args) {
            for (const [index, validator] of Object.entries(schema)) {
                const arg = args[parseInt(index)];
                const result = validator(arg);

                if (!result.valid) {
                    throw new Error(
                        `Validation failed for argument ${index} of ${propertyKey}: ${result.error}`
                    );
                }
            }

            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}

// Common validators
export const validators = {
    required: (value) => ({
        valid: value !== null && value !== undefined,
        error: 'Value is required'
    }),

    string: (value) => ({
        valid: typeof value === 'string',
        error: 'Value must be a string'
    }),

    number: (value) => ({
        valid: typeof value === 'number' && !isNaN(value),
        error: 'Value must be a number'
    }),

    array: (value) => ({
        valid: Array.isArray(value),
        error: 'Value must be an array'
    }),

    minLength: (min) => (value) => ({
        valid: value && value.length >= min,
        error: `Value must have at least ${min} items`
    }),

    maxLength: (max) => (value) => ({
        valid: value && value.length <= max,
        error: `Value must have at most ${max} items`
    })
};
