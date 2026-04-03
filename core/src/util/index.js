/**
 * SeNARS Core Utilities
 * Consolidated utility modules following DRY principles
 */

// Object utilities
export * from './object.js';

// Async utilities
export * from './async.js';

// Collection utilities
export * from './collection.js';

// Math utilities
export * from './math.js';

// String utilities
export * from './string.js';

// Error handling utilities
export * from './error.js';

// Validation utilities
export * from './validate.js';

// Configuration utilities
export * from './config.js';

// Functional utilities
export * from './func.js';

// Performance utilities
export * from './perf.js';

// Guard utilities
export * from './guard.js';

// Re-export commonly used items from other modules for backward compatibility
export { Logger } from './Logger.js';
export { EventBus } from './EventBus.js';
export * from './CustomErrors.js';

// New consolidated utilities
export * from './PathUtils.js';
export * from './Singleton.js';
export * from './WebSocketUtils.js';
