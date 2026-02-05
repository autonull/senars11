import {Logger} from './Logger.js';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const normalize = (value, max) => Math.min(value / max, 1);
export const isBetween = (value, min, max) => value >= min && value <= max;

export const safeExecute = (fn, ...args) => {
    try {
        return fn(...args);
    } catch {
        return null;
    }
};

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

export const clampAndFreeze = (obj, min = 0, max = 1) =>
    typeof obj === 'number'
        ? freeze(clamp(obj, min, max))
        : freeze(Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                key,
                typeof value === 'number' ? clamp(value, min, max) : value
            ])
        ));

export const mergeConfig = (base, ...overrides) => freeze({...base, ...Object.assign({}, ...overrides)});

export const isNumber = value => typeof value === 'number' && !isNaN(value);
export const round = (value, decimals = 2) => Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);

export const capitalize = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
export const kebabCase = str => str?.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() ?? '';

export const unique = arr => [...new Set(arr)];
export const isEmpty = arr => !arr || (Array.isArray(arr) && arr.length === 0) || (typeof arr === 'object' && Object.keys(arr).length === 0);

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

export const formatNumber = (num, decimals = 2) =>
    typeof num === 'number' ? num.toFixed(decimals) : String(num ?? '0');

export const safeAsync = async (asyncFn, defaultValue = null) => {
    try {
        return await asyncFn();
    } catch (error) {
        Logger.error('Error in safeAsync', {message: error?.message || error});
        return defaultValue;
    }
};

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const timeout = (ms, message = 'Operation timed out') => {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
    });
};

export const withTimeout = async (promise, ms, message = 'Operation timed out') => {
    return Promise.race([
        promise,
        timeout(ms, message)
    ]);
};

export async function* asyncIteratorWithDelay(items, delay = 0) {
    for (const item of items) {
        if (delay > 0) await sleep(delay);
        yield item;
    }
}

export const generateId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const formatTimestamp = (timestamp = Date.now()) => new Date(timestamp).toISOString();

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

export const getMemoryUsage = () => {
    if (typeof process !== 'undefined' && process.memoryUsage) {
        return process.memoryUsage();
    }
    return null;
};

export const getHeapUsed = () => {
    const memUsage = getMemoryUsage();
    return memUsage?.heapUsed ?? 0;
};

export const isNodeEnvironment = () => typeof process !== 'undefined' && process.versions?.node;

export const isBrowserEnvironment = () => typeof window !== 'undefined';
