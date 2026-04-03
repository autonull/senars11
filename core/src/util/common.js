/**
 * common.js - Backward compatibility re-exports
 * Consolidates commonly used utilities
 */
export * from './async.js';
export {
    sortByProperty, filterBy, findBy, groupBy, applyToAll, createMap, createSet,
    chunk, flatten, flattenDeep, calculateAverage, calculateStatistics,
    getPercentile, getOutliers, correlation, sum, min, max, partition
} from './collection.js';
export * from './math.js';
export {
    cleanText, capitalize, truncate, escapeRegExp, safeJSONParse, isValidLength,
    isEmpty, isNonEmpty, pad, repeat, randomString
} from './string.js';
export {
    logError, logDetailedError, createErrorHandler, safeAsync, safeSync,
    safeExecuteSync, wrapError, executeWithHandling, executeSyncWithHandling,
    withRetry, createSafeWrapper, formatError, validateParams, ErrorHandler
} from './error.js';
export * from './validate.js';
export * from './func.js';
export * from './guard.js';
export * from './MiscUtils.js';
export * from './config.js';
export {
    freeze, deepFreeze, isObject, deepClone, safeClone, selectiveDeepClone,
    deepMerge, deepMergeConfig, safeGet, setNestedProperty, deepEqual, validateWithSchema
} from './object.js';
