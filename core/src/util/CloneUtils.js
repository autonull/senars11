/**
 * Deep clone utility for SeNARS
 * Provides efficient deep cloning with type preservation
 */

/**
 * Deep clone an object using structuredClone if available, otherwise fallback to custom implementation
 * @param {*} obj - Object to clone
 * @param {WeakMap} [hash=new WeakMap()] - Internal cache for circular references
 * @returns {*} Deep cloned object
 */
export function deepClone(obj, hash = new WeakMap()) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    if (obj instanceof RegExp) {
        return new RegExp(obj.source, obj.flags);
    }

    if (obj instanceof Map) {
        const result = new Map();
        hash.set(obj, result);
        for (const [key, value] of obj.entries()) {
            result.set(deepClone(key, hash), deepClone(value, hash));
        }
        return result;
    }

    if (obj instanceof Set) {
        const result = new Set();
        hash.set(obj, result);
        for (const value of obj) {
            result.add(deepClone(value, hash));
        }
        return result;
    }

    if (obj instanceof Array) {
        const result = new Array(obj.length);
        hash.set(obj, result);
        for (let i = 0; i < obj.length; i++) {
            result[i] = deepClone(obj[i], hash);
        }
        return result;
    }

    if (typeof obj === 'object') {
        if (hash.has(obj)) {
            return hash.get(obj);
        }

        const result = Object.create(Object.getPrototypeOf(obj));
        hash.set(obj, result);

        for (const key of Object.keys(obj)) {
            result[key] = deepClone(obj[key], hash);
        }

        return result;
    }

    return obj;
}

/**
 * Safe clone that uses structuredClone when available, falls back to deepClone
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function safeClone(obj) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch {
            // structuredClone may fail on certain objects (DOM nodes, functions, etc.)
            // Fall back to custom implementation
        }
    }
    return deepClone(obj);
}

/**
 * Shallow clone with selective deep properties
 * @param {Object} obj - Object to clone
 * @param {Array<string>} deepProps - Properties to deep clone
 * @returns {Object} Cloned object
 */
export function selectiveDeepClone(obj, deepProps = []) {
    const result = { ...obj };

    for (const prop of deepProps) {
        if (obj[prop] !== undefined) {
            result[prop] = deepClone(obj[prop]);
        }
    }

    return result;
}
