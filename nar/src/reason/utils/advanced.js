/**
 * Advanced utility functions for the reasoner following AGENTS.md guidelines
 */

/**
 * Create a configurable pipeline of functions that can be composed together
 * @param {...Function} functions - Functions to compose in order
 * @returns {Function} A composed function that applies all functions in sequence
 */
export function createPipeline(...functions) {
    return functions.reduceRight((a, b) => (...args) => a(b(...args)), value => value);
}

/**
 * Create a configurable filter pipeline that can be parameterized
 * @param {Array<Function>} filters - Filter functions to apply
 * @returns {Function} A function that applies all filters
 */
export function createFilterPipeline(filters) {
    return (item) => filters.every(filter => {
        try {
            return filter(item);
        } catch (error) {
            return false; // Filter fails if error occurs
        }
    });
}

/**
 * A reusable predicate factory for common filtering conditions
 */
export const predicateFactory = {
    /**
     * Create a predicate to check if item has certain property values
     * @param {object} conditions - Object with property-value conditions
     * @returns {Function} Predicate function
     */
    hasProperties: (conditions) => (item) => {
        return Object.entries(conditions).every(([key, value]) => {
            if (typeof value === 'function') {
                return value(item[key]);
            }
            return item[key] === value;
        });
    },

    /**
     * Create a predicate to check if item matches certain type
     * @param {string} type - Type to check for
     * @returns {Function} Predicate function
     */
    hasType: (type) => (item) => {
        return item.type === type || (item.sentence && item.sentence.type === type);
    },

    /**
     * Create a predicate to check if item has certain priority range
     * @param {number} min - Minimum priority
     * @param {number} max - Maximum priority
     * @returns {Function} Predicate function
     */
    hasPriorityInRange: (min, max) => (item) => {
        const priority = item.priority ?? 0;
        return priority >= min && priority <= max;
    },

    /**
     * Create a predicate to check derivation depth
     * @param {number} maxDepth - Maximum derivation depth allowed
     * @returns {Function} Predicate function
     */
    hasMaxDepth: (maxDepth) => (item) => {
        return (item.stamp?.depth ?? 0) <= maxDepth;
    }
};

/**
 * A generic rule matching engine that can be parameterized
 * @param {Array<object>} rules - Rule definitions with conditions and actions
 * @returns {Function} A function that finds and applies matching rules
 */
export function createRuleMatcher(rules) {
    return (item) => {
        for (const rule of rules) {
            if (rule.condition(item)) {
                return rule.action(item);
            }
        }
        return null; // No rule matched
    };
}

/**
 * Create a parameterized configuration object with default values
 * @param {object} defaults - Default configuration values
 * @param {object} overrides - Configuration overrides
 * @returns {object} Merged configuration
 */
export function createConfig(defaults, overrides = {}) {
    return Object.freeze({...defaults, ...overrides});
}

/**
 * Create a memoized function to cache expensive operations
 * @param {Function} fn - Function to memoize
 * @param {Function} keyFn - Function to generate cache key (optional)
 * @returns {Function} Memoized function
 */
export function createMemoizedFunction(fn, keyFn = JSON.stringify) {
    const cache = new Map();

    return function (...args) {
        const key = keyFn(args);

        if (cache.has(key)) {
            return cache.get(key);
        }

        const result = fn.apply(this, args);
        cache.set(key, result);
        return result;
    };
}

/**
 * Create a parameterized retry mechanism with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 100)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {number} options.backoffMultiplier - Backoff multiplier (default: 2)
 * @returns {Function} Function with retry logic
 */
export function createRetryableFunction(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 100,
        maxDelay = 10000,
        backoffMultiplier = 2
    } = options;

    return async function (...args) {
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                lastError = error;

                if (attempt === maxRetries) {
                    break;
                }

                // Calculate delay with exponential backoff
                const delay = Math.min(
                    initialDelay * Math.pow(backoffMultiplier, attempt),
                    maxDelay
                );

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    };
}

/**
 * Create an async rate limiter
 * @param {number} rate - Number of operations per time window
 * @param {number} timeWindow - Time window in milliseconds
 * @returns {Function} Rate limiter function
 */
export function createRateLimiter(rate, timeWindow = 1000) {
    const timestamps = [];

    return async () => {
        const now = Date.now();

        // Remove timestamps outside the time window
        while (timestamps.length > 0 && now - timestamps[0] > timeWindow) {
            timestamps.shift();
        }

        // If we've reached the rate limit, wait
        if (timestamps.length >= rate) {
            const waitTime = timeWindow - (now - timestamps[0]);
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            // Recalculate after waiting
            const newNow = Date.now();
            while (timestamps.length > 0 && newNow - timestamps[0] > timeWindow) {
                timestamps.shift();
            }
        }

        // Add current timestamp
        timestamps.push(now);
    };
}

/**
 * Create a parameterized aggregation function
 * @param {Function} groupFn - Function to determine group key
 * @param {Function} aggregateFn - Function to aggregate items in each group
 * @returns {Function} Aggregation function
 */
export function createAggregator(groupFn, aggregateFn) {
    return (items) => {
        const groups = new Map();

        for (const item of items) {
            const key = groupFn(item);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(item);
        }

        const result = {};
        for (const [key, group] of groups) {
            result[key] = aggregateFn(group);
        }

        return result;
    };
}

/**
 * Create a parameterized validator
 * @param {Array<Function>} validators - Array of validation functions
 * @returns {Function} Validation function
 */
export function createValidator(validators) {
    return (item) => {
        const errors = [];

        for (const validator of validators) {
            try {
                const result = validator(item);
                if (result !== true) {
                    errors.push(result ?? 'Validation failed');
                }
            } catch (error) {
                errors.push(error.message ?? 'Validation error');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    };
}

/**
 * Create a fluent interface builder for complex object construction
 * @param {Function} builderFn - Function to build the object
 * @returns {Function} Fluent builder
 */
export function createFluentBuilder(builderFn) {
    return (initialState = {}) => {
        const state = {...initialState};

        const builder = {
            set(key, value) {
                state[key] = value;
                return this;
            },

            update(updateFn) {
                Object.assign(state, updateFn(state));
                return this;
            },

            add(key, value) {
                if (!state[key]) {
                    state[key] = Array.isArray(value) ? [] : {};
                }
                if (Array.isArray(state[key])) {
                    state[key].push(value);
                } else {
                    state[key][value] = value;
                }
                return this;
            },

            build() {
                return builderFn(state);
            }
        };

        return builder;
    };
}

/**
 * Create a parameterized transformer that applies multiple transformations
 * @param {Array<Function>} transforms - Transform functions to apply in order
 * @returns {Function} Transformation function
 */
export function createTransformer(transforms) {
    return (item) => {
        let result = item;
        for (const transform of transforms) {
            result = transform(result);
        }
        return result;
    };
}

/**
 * Create a fluent rule builder for simple rule construction
 * @returns {object} Fluent rule builder
 */
export function createRuleBuilder() {
    const ruleState = {
        id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'general',
        priority: 1.0,
        guards: [],
        applyFn: () => [],
        applyAsyncFn: null
    };

    return {
        withId(id) {
            ruleState.id = id;
            return this;
        },

        withType(type) {
            ruleState.type = type;
            return this;
        },

        withPriority(priority) {
            ruleState.priority = priority;
            return this;
        },

        withGuards(guards) {
            ruleState.guards = guards;
            return this;
        },

        withApplyFunction(fn) {
            ruleState.applyFn = fn;
            return this;
        },

        withAsyncApplyFunction(fn) {
            ruleState.applyAsyncFn = fn;
            return this;
        },

        build() {
            return {
                id: ruleState.id,
                type: ruleState.type,
                priority: ruleState.priority,
                guards: ruleState.guards,
                canApply: (primary, secondary) => {
                    return ruleState.guards.length === 0 || ruleState.guards.every(guard => guard(primary, secondary));
                },
                apply: (primary, secondary, context) => {
                    return ruleState.applyFn(primary, secondary, context);
                },
                applyAsync: async (primary, secondary, context) => {
                    if (ruleState.applyAsyncFn) {
                        return await ruleState.applyAsyncFn(primary, secondary, context);
                    }
                    return ruleState.applyFn(primary, secondary, context);
                }
            };
        }
    };
}

/**
 * Create a reusable rule validator to check if rules meet certain criteria
 * @param {Array<Function>} checks - Validation checks
 * @returns {Function} Validation function
 */
export function createRuleValidator(checks) {
    return (rule) => {
        const results = checks.map(check => check(rule));
        return {
            isValid: results.every(r => r.isValid),
            issues: results.filter(r => !r.isValid).map(r => r.issue)
        };
    };
}