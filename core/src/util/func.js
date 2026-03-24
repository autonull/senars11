/**
 * Functional utilities for SeNARS
 */

/**
 * Compose functions (right to left)
 * @param  {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 */
export const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);

/**
 * Pipe functions (left to right)
 * @param  {...Function} fns - Functions to pipe
 * @returns {Function} Piped function
 */
export const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

/**
 * Curry a function
 * @param {Function} fn - Function to curry
 * @returns {Function} Curried function
 */
export function curry(fn) {
    return function curried(...args) {
        if (args.length >= fn.length) return fn.apply(this, args);
        return function(...args2) {
            return curried.apply(this, args.concat(args2));
        };
    };
}

/**
 * Partial application
 * @param {Function} fn - Function to partially apply
 * @param {...*} args - Arguments to pre-apply
 * @returns {Function} Partially applied function
 */
export const partial = (fn, ...args) => (...rest) => fn(...args, ...rest);

/**
 * Partial application from right
 * @param {Function} fn - Function to partially apply
 * @param {...*} args - Arguments to pre-apply from right
 * @returns {Function} Partially applied function
 */
export const partialRight = (fn, ...args) => (...rest) => fn(...rest, ...args);

/**
 * Identity function
 * @param {*} x - Input value
 * @returns {*} Same value
 */
export const identity = (x) => x;

/**
 * Constant function
 * @param {*} value - Value to return
 * @returns {Function} Function that always returns the value
 */
export const constant = (value) => () => value;

/**
 * Tap function for debugging pipelines
 * @param {Function} fn - Function to call
 * @returns {Function} Function that calls fn and returns original value
 */
export const tap = (fn) => (x) => {
    fn(x);
    return x;
};

/**
 * Negate a predicate
 * @param {Function} predicate - Predicate function
 * @returns {Function} Negated predicate
 */
export const not = (predicate) => (...args) => !predicate(...args);

/**
 * Logical AND of predicates
 * @param  {...Function} predicates - Predicate functions
 * @returns {Function} Combined predicate
 */
export const and = (...predicates) => (x) => predicates.every(p => p(x));

/**
 * Logical OR of predicates
 * @param  {...Function} predicates - Predicate functions
 * @returns {Function} Combined predicate
 */
export const or = (...predicates) => (x) => predicates.some(p => p(x));

/**
 * Get property from object
 * @param {string} key - Property key
 * @returns {Function} Function that gets the property
 */
export const prop = (key) => (obj) => obj?.[key];

/**
 * Check if property equals value
 * @param {string} key - Property key
 * @param {*} value - Value to match
 * @returns {Function} Function that checks equality
 */
export const propEq = (key, value) => (obj) => obj?.[key] === value;

/**
 * Check if property satisfies predicate
 * @param {string} key - Property key
 * @param {Function} predicate - Predicate function
 * @returns {Function} Function that checks predicate
 */
export const propSatisfies = (key, predicate) => (obj) => predicate(obj?.[key]);

/**
 * Pick specific properties from object
 * @param {string[]} keys - Keys to pick
 * @param {Object} obj - Source object
 * @returns {Object} Object with picked properties
 */
export const pick = (keys, obj) => {
    if (!obj || !keys) return {};
    return keys.reduce((acc, key) => {
        if (key in obj) acc[key] = obj[key];
        return acc;
    }, {});
};

/**
 * Omit specific properties from object
 * @param {string[]} keys - Keys to omit
 * @param {Object} obj - Source object
 * @returns {Object} Object without omitted properties
 */
export const omit = (keys, obj) => {
    if (!obj || !keys) return { ...obj };
    return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));
};

/**
 * Partition array based on predicate
 * @param {Function} predicate - Predicate function
 * @param {Array} arr - Array to partition
 * @returns {[Array, Array]} [matching, non-matching]
 */
export const partition = (predicate, arr) => {
    if (!Array.isArray(arr)) return [[], []];
    return arr.reduce((acc, item) => {
        acc[predicate(item) ? 0 : 1].push(item);
        return acc;
    }, [[], []]);
};

/**
 * Memoize a function
 * @param {Function} fn - Function to memoize
 * @param {Function} resolver - Custom cache key resolver
 * @returns {Function} Memoized function
 */
export function memoize(fn, resolver) {
    const cache = new Map();
    return function(...args) {
        const key = resolver ? resolver(...args) : JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const result = fn.apply(this, args);
        cache.set(key, result);
        return result;
    };
}

/**
 * Once - create function that only executes once
 * @param {Function} fn - Function to wrap
 * @returns {Function} Function that executes once
 */
export const once = (fn) => {
    let called = false;
    let result;
    return (...args) => {
        if (!called) {
            called = true;
            result = fn(...args);
        }
        return result;
    };
};

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
