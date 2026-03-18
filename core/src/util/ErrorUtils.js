/**
 * Standardized error handling utilities for SeNARS
 * Following AGENTS.md guidelines for elegant, consolidated, consistent, organized, and DRY code
 */

import { Logger } from './Logger.js';
import * as CustomErrors from './CustomErrors.js';
import { createErrorHandler, validateParams, withRetry, createSafeWrapper } from './ComprehensiveErrorUtils.js';

// Export all custom errors
export * from './CustomErrors.js';

// Re-export commonly used functions from comprehensive utils
export { 
    logError, 
    safeAsync, 
    safeSync, 
    wrapError, 
    logDetailedError, 
    executeWithHandling, 
    executeSyncWithHandling,
    validateParams,
    withRetry,
    createSafeWrapper
} from './ComprehensiveErrorUtils.js';

/**
 * Standardized error handler class for consistent error handling across components
 * Follows AGENTS.md guidelines for modularized and parameterized design
 */
export class ErrorHandler {
    /**
     * Create an error handler for a specific component
     * @param {string} componentName - Name of the component
     */
    constructor(componentName = '') {
        this.componentName = componentName;
        this.handlers = createErrorHandler(componentName);
    }

    /**
     * Log an error with the component's name
     * @param {Error|string} error - Error to log
     * @param {Object} context - Context information
     * @param {string} level - Log level
     */
    logError(error, context = {}, level = 'error') {
        return this.handlers.logError(error, context, level);
    }

    /**
     * Wrap an error with component context
     * @param {Error} error - Original error
     * @param {string} message - Additional message
     * @param {Object} context - Additional context
     * @returns {Error} Wrapped error
     */
    wrapError(error, message, context = {}) {
        return this.handlers.wrapError(error, message, context);
    }

    /**
     * Safely execute an async function with error handling
     * @param {Function} asyncFn - Async function to execute
     * @param {string} context - Context for error logging
     * @param {Object} contextInfo - Additional context information
     * @param {*} defaultValue - Default value to return on error
     * @returns {*} Result of async function or default value
     */
    async safeAsync(asyncFn, context = '', contextInfo = {}, defaultValue = null) {
        return this.handlers.safeAsync(asyncFn, context, contextInfo, defaultValue);
    }

    /**
     * Safely execute a sync function with error handling
     * @param {Function} syncFn - Sync function to execute
     * @param {string} context - Context for error logging
     * @param {Object} contextInfo - Additional context information
     * @param {*} defaultValue - Default value to return on error
     * @returns {*} Result of sync function or default value
     */
    safeSync(syncFn, context = '', contextInfo = {}, defaultValue = null) {
        return this.handlers.safeSync(syncFn, context, contextInfo, defaultValue);
    }

    /**
     * Execute an async operation with standardized try-catch handling
     * @param {Function} operation - Async operation to execute
     * @param {string} context - Context for error logging
     * @param {Object} options - Options for error handling
     * @returns {*} Result of operation or null on error
     */
    async executeWithHandling(operation, context = '', options = {}) {
        return this.handlers.executeWithHandling(operation, context, options);
    }

    /**
     * Execute a sync operation with standardized try-catch handling
     * @param {Function} operation - Sync operation to execute
     * @param {string} context - Context for error logging
     * @param {Object} options - Options for error handling
     * @returns {*} Result of operation or null on error
     */
    executeSyncWithHandling(operation, context = '', options = {}) {
        return this.handlers.executeSyncWithHandling(operation, context, options);
    }
}