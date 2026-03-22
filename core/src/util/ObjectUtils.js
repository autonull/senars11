export const freeze = Object.freeze;

export const deepFreeze = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;

    for (const prop of Object.getOwnPropertyNames(obj)) {
        deepFreeze(obj[prop]);
    }

    return freeze(obj);
};

export const mergeConfig = (base, ...overrides) => freeze({ ...base, ...Object.assign({}, ...overrides) });

export const safeGet = (obj, path, defaultValue) => {
    if (!obj || typeof obj !== 'object' || !path) return defaultValue;
    return path.split('.').reduce((current, key) => current?.[key] ?? defaultValue, obj) ?? defaultValue;
};

export const setNestedProperty = (obj, path, value) => {
    if (!obj || typeof path !== 'string') return;

    const keys = path.split('.');
    let current = obj;

    for (const key of keys.slice(0, -1)) {
        current[key] ??= {};
        current = current[key];
    }

    current[keys.at(-1)] = value;
};

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

export function selectiveDeepClone(obj, deepProps = []) {
    const result = { ...obj };

    for (const prop of deepProps) {
        if (obj[prop] !== undefined) {
            result[prop] = deepClone(obj[prop]);
        }
    }

    return result;
}

export const isObject = (item) => item && typeof item === 'object' && !Array.isArray(item);

export const deepMerge = (target, source) => {
    if (!source) return target;
    if (!isObject(target) || !isObject(source)) return source;

    const output = { ...target };

    for (const key of Object.keys(source)) {
        output[key] = isObject(source[key]) && key in target
            ? deepMerge(target[key], source[key])
            : source[key];
    }
    
    return output;
};

export const deepMergeConfig = (base, ...overrides) => overrides.reduce((acc, curr) => deepMerge(acc, curr), base);

/**
 * Shared schema validation utility used by BaseComponent and ConfigurableComponent
 * @param {Object} config - Configuration to validate
 * @param {Object|Function} schema - Validation schema (object or function returning schema)
 * @returns {Object} Validated configuration
 */
export function validateWithSchema(config, schema) {
    if (!schema) return config;

    const resolvedSchema = typeof schema === 'function' ? schema() : schema;

    const result = resolvedSchema.validate(config, {
        stripUnknown: true,
        allowUnknown: false,
        convert: true
    });

    if (result.error) {
        throw new Error(`Configuration validation failed: ${result.error.message}`);
    }

    return result.value;
}
