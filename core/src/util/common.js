/**
 * common.js - Backward compatibility re-exports
 * Consolidates commonly used utilities
 */
export * from './async.js';
// Export collection utils (excluding 'unique' to avoid conflict with MiscUtils.js)
export {
    sortByProperty,
    filterBy,
    findBy,
    groupBy,
    applyToAll,
    createMap,
    createSet,
    chunk,
    flatten,
    flattenDeep,
    calculateAverage,
    calculateStatistics,
    getPercentile,
    getOutliers,
    correlation,
    sum,
    min,
    max,
    partition
} from './collection.js';
export * from './math.js';
// Export string utils (excluding 'isEmpty', 'generateId', 'formatTimestamp' to avoid conflict with MiscUtils.js)
export {
    cleanText,
    capitalize,
    truncate,
    escapeRegExp,
    safeJSONParse,
    isValidLength,
    isNonEmpty,
    pad,
    repeat,
    randomString
} from './string.js';
// Export error utils (excluding 'safeExecute' to avoid conflict with MiscUtils.js)
export {
    logError,
    logDetailedError,
    createErrorHandler,
    safeAsync,
    safeSync,
    safeExecuteSync,
    wrapError,
    executeWithHandling,
    executeSyncWithHandling,
    withRetry,
    createSafeWrapper,
    formatError,
    handleError,
    validateParams
} from './error.js';
export * from './CustomErrors.js';
export * from './validate.js';
export * from './func.js';
// Export perf utils (excluding 'debounce', 'throttle', 'memoize' to avoid conflict with func.js)
export {
    measureTime,
    cacheWithTTL,
    lazy,
    rateLimit
} from './perf.js';
export * from './guard.js';
// MiscUtils takes precedence for conflicting exports
export * from './MiscUtils.js';
// Export config (takes precedence for mergeConfig)
export * from './config.js';
// Export object utils (excluding mergeConfig to avoid conflict with config.js, pick/omit to avoid conflict with func.js)
export {
    freeze,
    deepFreeze,
    isObject,
    deepClone,
    safeClone,
    selectiveDeepClone,
    deepMerge,
    deepMergeConfig,
    safeGet,
    setNestedProperty,
    deepEqual,
    validateWithSchema
} from './object.js';

