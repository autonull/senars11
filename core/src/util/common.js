/**
 * common.js - Backward compatibility re-exports
 * Consolidates commonly used utilities
 */
export * from './object.js';
export * from './async.js';
export * from './collection.js';
export * from './math.js';
export * from './string.js';
export * from './error.js';
export * from './validate.js';
export * from './config.js';
export * from './func.js';
export * from './perf.js';
export * from './guard.js';
export * from './MiscUtils.js';

// Re-export safeAsync from error.js for backward compatibility
export { safeAsync } from './error.js';
