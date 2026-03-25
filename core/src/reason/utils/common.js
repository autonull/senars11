/**
 * Common utility functions for the reasoner components
 * Consolidated into core/src/util/common.js and RuleHelpers.js
 */

export {
    deepClone,
    deepMerge,
    deepMergeConfig,
    mergeConfig,
    safeClone,
    selectiveDeepClone,
    isObject,
    freeze,
    deepFreeze,
    safeGet,
    setNestedProperty,
    pick,
    omit,
    deepEqual,
    validateWithSchema,
    sleep,
    timeout,
    retry,
    isAsync,
    unique,
    isEmpty,
    generateId,
    formatTimestamp,
    getMemoryUsage,
    getHeapUsed,
    isNodeEnvironment,
    isBrowserEnvironment,
    clamp,
    round,
    random,
    randomInt,
    randomString,
    normalize,
    isValidLength,
    cleanText
} from '../../util/common.js';
export {processDerivation} from '../RuleHelpers.js';
