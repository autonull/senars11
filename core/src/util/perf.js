/**
 * Performance utilities for SeNARS
 */

import { Logger } from './Logger.js';

/**
 * Debounce a function with cancel and flush capabilities
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Object} Debounced function with cancel and flush methods
 */
export function debounce(func, wait) {
    let timeout = null;

    const debounced = function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };

    debounced.cancel = () => {
        clearTimeout(timeout);
        timeout = null;
    };

    debounced.flush = (...args) => {
        clearTimeout(timeout);
        timeout = null;
        return func.apply(this, args);
    };

    return debounced;
}

/**
 * Throttle a function with leading and trailing options
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @param {Object} options - Options
 * @param {boolean} options.leading - Call on leading edge
 * @param {boolean} options.trailing - Call on trailing edge
 * @returns {Function} Throttled function
 */
export function throttle(func, limit, options = {}) {
    const { leading = true, trailing = true } = options;
    let inThrottle = false;
    let lastArgs = null;
    let timeout = null;

    const throttled = function(...args) {
        if (!inThrottle) {
            if (leading) func.apply(this, args);
            inThrottle = true;
            lastArgs = args;

            if (trailing) {
                timeout = setTimeout(() => {
                    if (!leading && lastArgs) func.apply(this, lastArgs);
                    inThrottle = false;
                    lastArgs = null;
                    timeout = null;
                }, limit);
            } else {
                setTimeout(() => {
                    inThrottle = false;
                    lastArgs = null;
                    timeout = null;
                }, limit);
            }
        } else if (trailing) {
            lastArgs = args;
        }
    };

    throttled.cancel = () => {
        clearTimeout(timeout);
        inThrottle = false;
        lastArgs = null;
        timeout = null;
    };

    return throttled;
}

/**
 * Memoize a function with custom resolver and cache size limit
 * @param {Function} fn - Function to memoize
 * @param {Object} options - Options
 * @param {Function} options.resolver - Custom cache key resolver
 * @param {number} options.maxSize - Maximum cache size
 * @returns {Function} Memoized function
 */
export function memoize(fn, options = {}) {
    const { resolver = null, maxSize = 1000 } = options;
    const cache = new Map();

    const memoized = function(...args) {
        const key = resolver ? resolver.apply(this, args) : JSON.stringify(args);
        if (cache.has(key)) {
            const value = cache.get(key);
            cache.delete(key);
            cache.set(key, value);
            return value;
        }

        const result = fn.apply(this, args);
        cache.set(key, result);

        if (cache.size > maxSize) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }

        return result;
    };

    memoized.cache = cache;
    memoized.clear = () => cache.clear();
    memoized.delete = (key) => cache.delete(key);
    memoized.has = (key) => cache.has(key);

    return memoized;
}

/**
 * Rate limit a function
 * @param {Function} fn - Function to rate limit
 * @param {number} rate - Maximum calls per interval
 * @param {number} interval - Interval in ms
 * @returns {Function} Rate limited function
 */
export function rateLimit(fn, rate, interval) {
    const queue = [];
    let timeout = null;

    return function(...args) {
        return new Promise((resolve, reject) => {
            queue.push({ args, resolve, reject });

            const processQueue = () => {
                if (queue.length === 0) {
                    clearTimeout(timeout);
                    timeout = null;
                    return;
                }

                const now = Date.now();
                const toProcess = queue.splice(0, rate);

                toProcess.forEach(({ args, resolve, reject }) => {
                    Promise.resolve(fn.apply(this, args))
                        .then(resolve)
                        .catch(reject);
                });

                timeout = setTimeout(processQueue, interval);
            };

            if (!timeout) processQueue();
        });
    };
}

/**
 * Measure execution time of a function
 * @param {Function} fn - Function to measure
 * @param {string} label - Label for logging
 * @returns {Function} Wrapped function
 */
export function measureTime(fn, label = 'Function') {
    return async function(...args) {
        const start = performance.now();
        try {
            const result = await fn.apply(this, args);
            Logger.debug(`${label} executed in ${(performance.now() - start).toFixed(2)}ms`);
            return result;
        } catch (error) {
            Logger.error(`${label} failed after ${(performance.now() - start).toFixed(2)}ms: ${error.message}`);
            throw error;
        }
    };
}

/**
 * Cache with TTL (time to live)
 * @param {Function} fn - Function to cache
 * @param {number} ttl - Time to live in ms
 * @returns {Function} Cached function
 */
export function cacheWithTTL(fn, ttl = 60000) {
    const cache = new Map();

    return async function(...args) {
        const key = JSON.stringify(args);
        const cached = cache.get(key);

        if (cached && Date.now() - cached.timestamp < ttl) return cached.value;

        const value = await fn.apply(this, args);
        cache.set(key, { value, timestamp: Date.now() });
        return value;
    };
}

/**
 * Lazy evaluation wrapper
 * @param {Function} fn - Function to lazily evaluate
 * @returns {Function} Lazy function
 */
export function lazy(fn) {
    let evaluated = false;
    let result = null;

    return function(...args) {
        if (!evaluated) {
            result = fn.apply(this, args);
            evaluated = true;
        }
        return result;
    };
}
