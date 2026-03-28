export const freeze = Object.freeze;

export const deepFreeze = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;

    for (const prop of Object.getOwnPropertyNames(obj)) {
        if (obj[prop] !== null && typeof obj[prop] === 'object') {
            deepFreeze(obj[prop]);
        }
    }

    return freeze(obj);
};

export const mergeConfig = (base, ...overrides) => freeze({...base, ...Object.assign({}, ...overrides)});

export const safeGet = (obj, path, defaultValue = undefined) => {
    if (!obj || typeof obj !== 'object' || !path) return defaultValue;

    return path.split('.').reduce((current, key) =>
        current?.[key] ?? defaultValue, obj) ?? defaultValue;
};

export const setNestedProperty = (obj, path, value) => {
    if (!obj || typeof path !== 'string') return;
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] == null) current[keys[i]] = {};
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
};

export const deepClone = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(item => deepClone(item));

    if (typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, deepClone(value)])
        );
    }

    return obj;
};

export const isObject = item => (item && typeof item === 'object' && !Array.isArray(item));

export function deepMerge(target, source) {
    if (!source) return target;
    if (!isObject(target) || !isObject(source)) return source;

    const output = {...target};

    if (isObject(target) && isObject(source)) {
        for (const key of Object.keys(source)) {
            if (isObject(source[key])) {
                if (!(key in target)) output[key] = source[key];
                else output[key] = deepMerge(target[key], source[key]);
            } else {
                output[key] = source[key];
            }
        }
    }
    return output;
}

export const deepMergeConfig = (base, ...overrides) => {
    return overrides.reduce((acc, curr) => deepMerge(acc, curr), base);
};
