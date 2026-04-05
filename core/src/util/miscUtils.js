/**
 * Miscellaneous utilities for SeNARS
 * @deprecated Import specific utilities from their canonical modules:
 *   - generateId, formatTimestamp from './string.js'
 *   - isEmpty from './string.js' or './collection.js'
 *   - unique from './collection.js'
 *   - isNodeEnvironment, isBrowserEnvironment from './EnvironmentDetector.js'
 */
export {generateId, formatTimestamp} from './string.js';
export {unique} from './collection.js';
export {envDetector, isNodeEnvironment, isBrowserEnvironment} from './EnvironmentDetector.js';

export const safeExecute = (fn, ...args) => {
    try {
        return fn(...args);
    } catch {
        return null;
    }
};

export const getMemoryUsage = () => {
    if (typeof process !== 'undefined' && process.memoryUsage) {
        return process.memoryUsage();
    }
    return null;
};

export const getHeapUsed = () => getMemoryUsage()?.heapUsed ?? 0;
