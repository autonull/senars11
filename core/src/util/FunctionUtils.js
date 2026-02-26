/**
 * Function utilities for SeNARS
 * Provides higher-order functions, pipelines, and function composition utilities
 * Following AGENTS.md guidelines for elegant, consolidated, and DRY code
 */

/**
 * Function composition and pipeline utilities
 */
export const FunctionPipeline = Object.freeze({
    /**
     * Create a pipeline of functions composed in sequence
     * Each function's output becomes the next function's input
     *
     * @param {...Function} functions - Functions to compose in order (right-to-left)
     * @returns {Function} A composed function that applies all functions in sequence
     *
     * @example
     * const process = createPipeline(
     *     x => x + 1,
     *     x => x * 2,
     *     x => x - 3
     * );
     * process(5); // ((5 + 1) * 2) - 3 = 9
     */
    createPipeline(...functions) {
        return functions.reduceRight(
            (a, b) => (...args) => a(b(...args)),
            value => value
        );
    },

    /**
     * Create a filter pipeline that applies multiple filters
     * All filters must pass for an item to be included
     *
     * @param {Array<Function>} filters - Filter functions (predicates)
     * @returns {Function} A function that returns true if all filters pass
     *
     * @example
     * const filter = createFilterPipeline([
     *     item => item.priority > 0.5,
     *     item => item.type === 'BELIEF',
     *     item => !item.isProcessed
     * ]);
     * tasks.filter(filter);
     */
    createFilterPipeline(filters) {
        return (item) => filters.every(filter => {
            try {
                return filter(item);
            } catch {
                return false; // Filter fails if error occurs
            }
        });
    },

    /**
     * Create a transformation pipeline
     * Applies transformations in sequence, skipping null/undefined results
     *
     * @param {Array<Function>} transformers - Transformation functions
     * @returns {Function} A function that applies transformations
     */
    createTransformPipeline(transformers) {
        return (item) => {
            let result = item;
            for (const transformer of transformers) {
                if (result === null || result === undefined) {
                    break;
                }
                result = transformer(result);
            }
            return result;
        };
    }
});

/**
 * Predicate factory for creating reusable filter conditions
 */
export const PredicateFactory = Object.freeze({
    /**
     * Create a predicate to check if item has certain property values
     *
     * @param {Object} conditions - Object with property-value conditions
     * @returns {Function} Predicate function that returns true if all conditions match
     *
     * @example
     * const isHighPriority = hasProperties({ priority: 0.9 });
     * const isActive = hasProperties({ active: true });
     * const hasValidTruth = hasProperties({
     *     truth: t => t !== null && t.confidence > 0.5
     * });
     */
    hasProperties(conditions) {
        return (item) => {
            return Object.entries(conditions).every(([key, value]) => {
                if (typeof value === 'function') {
                    return value(item[key]);
                }
                return item[key] === value;
            });
        };
    },

    /**
     * Create a predicate to check if item matches a certain type
     *
     * @param {string} type - Type to check for
     * @returns {Function} Predicate function
     */
    isType(type) {
        return (item) => item?.type === type;
    },

    /**
     * Create a predicate to check if a property exists and is truthy
     *
     * @param {string} property - Property name to check
     * @returns {Function} Predicate function
     */
    hasProperty(property) {
        return (item) => !!item[property];
    },

    /**
     * Create a predicate to check if a property is within a range
     *
     * @param {string} property - Property name
     * @param {Object} range - Range with min/max values
     * @returns {Function} Predicate function
     */
    inRange(property, range) {
        return (item) => {
            const value = item[property];
            if (typeof value !== 'number') return false;
            if (range.min !== undefined && value < range.min) return false;
            if (range.max !== undefined && value > range.max) return false;
            return true;
        };
    },

    /**
     * Combine multiple predicates with AND logic
     *
     * @param {...Function} predicates - Predicate functions
     * @returns {Function} Combined predicate
     */
    and(...predicates) {
        return (item) => predicates.every(predicate => predicate(item));
    },

    /**
     * Combine multiple predicates with OR logic
     *
     * @param {...Function} predicates - Predicate functions
     * @returns {Function} Combined predicate
     */
    or(...predicates) {
        return (item) => predicates.some(predicate => predicate(item));
    },

    /**
     * Negate a predicate
     *
     * @param {Function} predicate - Predicate function
     * @returns {Function} Negated predicate
     */
    not(predicate) {
        return (item) => !predicate(item);
    }
});

/**
 * Function decorators and wrappers
 */
export const FunctionDecorator = Object.freeze({
    /**
     * Create a memoized wrapper around an expensive function
     * Caches results based on input arguments to improve performance
     *
     * @param {Function} fn - Function to memoize
     * @param {Function} [keyFn=JSON.stringify] - Function to generate cache keys from arguments
     * @returns {Function} Memoized function with cache management
     *
     * @example
     * const expensiveCalc = memoize((n) => {
     *     // Expensive computation
     *     return result;
     * });
     *
     * // With custom key function for non-serializable args
     * const memoizedObj = memoize(
     *     (obj) => process(obj),
     *     (args) => args[0].id  // Use object ID as cache key
     * );
     */
    memoize(fn, keyFn = JSON.stringify) {
        const cache = new Map();
        const memoizedFn = function(...args) {
            const key = keyFn(args);
            if (cache.has(key)) {
                return cache.get(key);
            }
            const result = fn.apply(this, args);
            cache.set(key, result);
            return result;
        };

        // Add cache management methods
        memoizedFn.clearCache = () => cache.clear();
        memoizedFn.getCacheSize = () => cache.size;
        memoizedFn.hasCached = (...args) => cache.has(keyFn(args));

        return memoizedFn;
    },

    /**
     * Create a retryable wrapper for functions that may fail transiently
     *
     * @param {Function} fn - Function to wrap
     * @param {Object} options - Retry options
     * @param {number} [options.maxRetries=3] - Maximum number of retries
     * @param {number} [options.delay=100] - Delay between retries in ms
     * @param {boolean} [options.exponential=true] - Use exponential backoff
     * @param {Function} [options.shouldRetry] - Custom retry condition
     * @returns {Function} Async function with retry logic
     *
     * @example
     * const fetchWithRetry = retryable(fetch, { maxRetries: 5, delay: 1000 });
     * const result = await fetchWithRetry(url);
     */
    retryable(fn, options = {}) {
        const {
            maxRetries = 3,
            delay = 100,
            exponential = true,
            shouldRetry = (error) => true
        } = options;

        return async function(...args) {
            let lastError;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await fn.apply(this, args);
                } catch (error) {
                    lastError = error;

                    if (!shouldRetry(error) || attempt === maxRetries) {
                        break;
                    }

                    const backoffDelay = exponential
                        ? delay * Math.pow(2, attempt)
                        : delay;

                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                }
            }

            throw lastError;
        };
    },

    /**
     * Create a rate-limited wrapper for functions
     * Limits how often a function can be called
     *
     * @param {Function} fn - Function to wrap
     * @param {number} rate - Maximum calls per time window
     * @param {number} [timeWindow=1000] - Time window in ms
     * @returns {Function} Rate-limited function
     *
     * @example
     * const limitedApi = rateLimit(api.call, 10, 1000); // 10 calls per second
     */
    rateLimit(fn, rate, timeWindow = 1000) {
        const timestamps = [];

        return async function(...args) {
            const now = Date.now();

            // Remove old timestamps outside the time window
            while (timestamps.length && timestamps[0] < now - timeWindow) {
                timestamps.shift();
            }

            if (timestamps.length >= rate) {
                // Wait until oldest timestamp expires
                const waitTime = timestamps[0] + timeWindow - now;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                timestamps.shift();
            }

            timestamps.push(Date.now());
            return fn.apply(this, args);
        };
    },

    /**
     * Create a debounced wrapper for functions
     * Delays execution until after a specified time has passed
     *
     * @param {Function} fn - Function to debounce
     * @param {number} delay - Delay in ms
     * @param {Object} [options] - Debounce options
     * @param {boolean} [options.immediate=false] - Call on leading edge
     * @returns {Function} Debounced function with cancel method
     *
     * @example
     * const saveDraft = debounce(draft => api.save(draft), 500);
     * // Cancel pending call if needed
     * saveDraft.cancel();
     */
    debounce(fn, delay, options = {}) {
        const { immediate = false } = options;
        let timeout = null;
        let result = null;

        const debouncedFn = function(...args) {
            const callNow = immediate && !timeout;

            clearTimeout(timeout);
            timeout = setTimeout(() => {
                timeout = null;
                if (!immediate) {
                    result = fn.apply(this, args);
                }
            }, delay);

            if (callNow) {
                result = fn.apply(this, args);
            }

            return result;
        };

        debouncedFn.cancel = () => {
            clearTimeout(timeout);
            timeout = null;
        };

        return debouncedFn;
    },

    /**
     * Create a throttled wrapper for functions
     * Ensures function is called at most once per specified interval
     *
     * @param {Function} fn - Function to throttle
     * @param {number} limit - Minimum time between calls in ms
     * @returns {Function} Throttled function
     *
     * @example
     * const handleScroll = throttle(() => updatePosition(), 100);
     */
    throttle(fn, limit) {
        let inThrottle = false;
        let lastResult = null;

        return function(...args) {
            if (!inThrottle) {
                inThrottle = true;
                lastResult = fn.apply(this, args);
                setTimeout(() => inThrottle = false, limit);
            }
            return lastResult;
        };
    }
});

/**
 * Async utility functions
 */
export const AsyncUtils = Object.freeze({
    /**
     * Create a promise that resolves after a delay
     *
     * @param {number} ms - Delay in milliseconds
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Run async operations with a timeout
     *
     * @param {Promise} promise - Promise to wrap with timeout
     * @param {number} ms - Timeout in milliseconds
     * @param {string} [message='Operation timed out'] - Timeout error message
     * @returns {Promise} Promise with timeout
     *
     * @throws {Error} If timeout is exceeded
     */
    async withTimeout(promise, ms, message = 'Operation timed out') {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(message)), ms)
        );

        return Promise.race([promise, timeout]);
    },

    /**
     * Run multiple async operations with concurrency limit
     *
     * @param {Array<Function>} tasks - Array of task functions (returning promises)
     * @param {number} concurrency - Maximum concurrent tasks
     * @returns {Promise<Array>} Array of results
     */
    async withConcurrency(tasks, concurrency) {
        const results = [];
        let index = 0;

        const worker = async () => {
            while (index < tasks.length) {
                const taskIndex = index++;
                results[taskIndex] = await tasks[taskIndex]();
            }
        };

        const workers = Array(Math.min(concurrency, tasks.length))
            .fill(null)
            .map(() => worker());

        await Promise.all(workers);
        return results;
    },

    /**
     * Retry an async operation with exponential backoff
     *
     * @param {Function} fn - Async function to retry
     * @param {Object} options - Retry options
     * @returns {Promise} Result of successful operation
     *
     * @throws {Error} If all retries fail
     */
    async retry(fn, options = {}) {
        const {
            maxRetries = 3,
            baseDelay = 100,
            maxDelay = 10000,
            shouldRetry = () => true
        } = options;

        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                if (!shouldRetry(error) || attempt === maxRetries) {
                    break;
                }

                const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                await this.delay(delay);
            }
        }

        throw lastError;
    }
});
