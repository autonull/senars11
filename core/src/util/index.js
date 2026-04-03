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

// Functional utilities (includes performance utils)
export * from './func.js';

// Guard utilities
export * from './guard.js';

// Re-export commonly used items for backward compatibility
export { Logger } from './Logger.js';
export { EventBus } from './EventBus.js';

// Additional utilities
export * from './PathUtils.js';
export * from './Singleton.js';
export * from './WebSocketUtils.js';
