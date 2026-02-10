export const safeExecute = (fn, ...args) => {
    try {
        return fn(...args);
    } catch {
        return null;
    }
};

export const unique = arr => [...new Set(arr)];
export const isEmpty = arr => !arr || (Array.isArray(arr) && arr.length === 0) || (typeof arr === 'object' && Object.keys(arr).length === 0);

export const generateId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const formatTimestamp = (timestamp = Date.now()) => new Date(timestamp).toISOString();

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
