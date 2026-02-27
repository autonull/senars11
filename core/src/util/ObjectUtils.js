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

export const deepClone = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(deepClone);
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, deepClone(value)]));
};

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
