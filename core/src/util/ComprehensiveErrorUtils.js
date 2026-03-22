/**
 * Comprehensive error handling utilities for SeNARS
 * Following AGENTS.md guidelines for elegant, consolidated, consistent, organized, and DRY code
 */

import { Logger } from './Logger.js';
import * as CustomErrors from './CustomErrors.js';
import { deepMerge } from './common.js';
import { validateSchema } from './InputValidator.js';

// Export all custom errors
export * from './CustomErrors.js';

/**
 * Standardized error logging function with consistent format
 * @param {Error|string} error - Error object or message
 * @param {Object} context - Context information for the error
 * @param {string} level - Log level ('error', 'warn', 'info', 'debug')
 * @param {string} component - Component name where error occurred
 */
export function logError(error, context = {}, level = 'error', component = '') {
    try {
        const logFunc = Logger[level] || Logger.error;

        // Format error message consistently
        const errorMessage = typeof error === 'string' ? error : error?.message || 'Unknown error';
        const errorStack = error?.stack;

        // Create consistent context object
        const logContext = {
            component,
            timestamp: new Date().toISOString(),
            ...context
        };

        // Add error object if it's not just a string
        if (typeof error !== 'string' && error) {
            logContext.errorDetails = {
                name: error.name,
                message: error.message,
                stack: errorStack,
                code: error.code,
                timestamp: error.timestamp
            };
        }

        logFunc(`[${component ? component + ' - ' : ''}Error] ${errorMessage}`, logContext);
    } catch (loggerError) {
        // Fallback to console if Logger fails
        console.error(`[${component ? component + ' - ' : ''}Error] ${typeof error === 'string' ? error : error?.message || 'Unknown error'}`, context);
    }
}

/**
 * Creates a contextual error handler for a specific component
 * @param {string} componentName - Name of the component
 * @returns {Object} Error handling utilities bound to the component
 */
export function createErrorHandler(componentName = '') {
    return {
        logError: (error, context = {}, level = 'error') => 
            logError(error, context, level, componentName),
        
        safeAsync: async (asyncFn, context = '', contextInfo = {}, defaultValue = null) => 
            safeAsync(asyncFn, `${componentName} - ${context}`, contextInfo, defaultValue),
        
        safeSync: (syncFn, context = '', contextInfo = {}, defaultValue = null) => 
            safeSync(syncFn, `${componentName} - ${context}`, contextInfo, defaultValue),
        
        executeWithHandling: async (operation, context = '', options = {}) => 
            executeWithHandling(operation, context, componentName, options),
        
        executeSyncWithHandling: (operation, context = '', options = {}) => 
            executeSyncWithHandling(operation, context, componentName, options),
        
        wrapError: (error, message, context = {}) => 
            wrapError(error, message, { ...context, component: componentName })
    };
}

/**
 * Safe async execution wrapper with standardized error handling
 * @param {Function} asyncFn - Async function to execute
 * @param {string} context - Context for error logging
 * @param {Object} contextInfo - Additional context information
 * @param {*} defaultValue - Default value to return on error
 * @returns {*} Result of async function or default value
 */
export async function safeAsync(asyncFn, context = '', contextInfo = {}, defaultValue = null) {
    try {
        return await asyncFn();
    } catch (error) {
        logError(error, { ...contextInfo, context }, 'error', context.split(' ')[0]);
        return defaultValue;
    }
}

/**
 * Safe sync execution wrapper with standardized error handling
 * @param {Function} syncFn - Sync function to execute
 * @param {string} context - Context for error logging
 * @param {Object} contextInfo - Additional context information
 * @param {*} defaultValue - Default value to return on error
 * @returns {*} Result of sync function or default value
 */
export function safeSync(syncFn, context = '', contextInfo = {}, defaultValue = null) {
    try {
        return syncFn();
    } catch (error) {
        logError(error, { ...contextInfo, context }, 'error', context.split(' ')[0]);
        return defaultValue;
    }
}

/**
 * Error wrapping utility with consistent format
 * @param {Error} error - Original error
 * @param {string} message - Additional message to prepend
 * @param {Object} context - Context information
 * @returns {Error} New error with wrapped message
 */
export function wrapError(error, message, context = {}) {
    const wrappedMessage = `${message}: ${error?.message || error}`;
    const newError = new Error(wrappedMessage);

    // Preserve original error as cause if possible
    if (error instanceof Error) {
        newError.cause = error;
    }

    // Add context information
    newError.context = context;
    newError.originalError = error;

    return newError;
}

/**
 * Enhanced error logger that includes additional metadata
 * @param {Error|string} error - Error to log
 * @param {Object} metadata - Additional metadata to include
 * @param {string} component - Component name
 */
export function logDetailedError(error, metadata = {}, component = '') {
    try {
        const errorObj = typeof error === 'string' ? new Error(error) : error;

        const detailedContext = {
            component,
            timestamp: new Date().toISOString(),
            ...metadata,
            errorType: errorObj?.constructor?.name,
            fileName: errorObj?.fileName,
            lineNumber: errorObj?.lineNumber,
            columnNumber: errorObj?.columnNumber
        };

        Logger.error(`[${component ? component + ' - ' : ''}Detailed Error] ${errorObj.message}`, detailedContext);
    } catch (loggerError) {
        // Fallback to console if Logger fails
        console.error(`[${component ? component + ' - ' : ''}Detailed Error] ${typeof error === 'string' ? error : error?.message || 'Unknown error'}`, metadata);
    }
}

/**
 * Execute an async operation with standardized try-catch handling
 * @param {Function} operation - Async operation to execute
 * @param {string} context - Context for error logging
 * @param {string} component - Component name for error logging
 * @param {Object} options - Options for error handling
 * @returns {*} Result of operation or null on error
 */
export async function executeWithHandling(operation, context = '', component = '', options = {}) {
    const {
        logLevel = 'error',
        logOnSuccess = false,
        defaultValue = null,
        throwOnError = false
    } = options;

    try {
        const result = await operation();

        if (logOnSuccess) {
            try {
                Logger.info(`[${component}] ${context} completed successfully`);
            } catch (loggerError) {
                console.info(`[${component}] ${context} completed successfully`);
            }
        }

        return result;
    } catch (error) {
        const errorMsg = `${context} failed: ${error.message}`;

        if (throwOnError) {
            throw wrapError(error, errorMsg, { context });
        }

        logError(error, { context }, logLevel, component);
        return defaultValue;
    }
}

/**
 * Execute a sync operation with standardized try-catch handling
 * @param {Function} operation - Sync operation to execute
 * @param {string} context - Context for error logging
 * @param {string} component - Component name for error logging
 * @param {Object} options - Options for error handling
 * @returns {*} Result of operation or null on error
 */
export function executeSyncWithHandling(operation, context = '', component = '', options = {}) {
    const {
        logLevel = 'error',
        logOnSuccess = false,
        defaultValue = null,
        throwOnError = false
    } = options;

    try {
        const result = operation();

        if (logOnSuccess) {
            try {
                Logger.info(`[${component}] ${context} completed successfully`);
            } catch (loggerError) {
                console.info(`[${component}] ${context} completed successfully`);
            }
        }

        return result;
    } catch (error) {
        const errorMsg = `${context} failed: ${error.message}`;

        if (throwOnError) {
            throw wrapError(error, errorMsg, { context });
        }

        logError(error, { context }, logLevel, component);
        return defaultValue;
    }
}

/**
 * Validates input parameters and throws appropriate errors
 * @param {Object} params - Parameters to validate
 * @param {Object} schema - Validation schema
 * @param {string} operation - Operation name for error context
 * @returns {Object} Validated parameters
 */
export function validateParams(params, schema, operation = 'operation') {
    return validateSchema(params, schema, operation);
}

/**
 * Executes an operation with retry logic
 * @param {Function} operation - Operation to execute
 * @param {Object} options - Retry options
 * @returns {*} Result of operation
 */
export async function withRetry(operation, options = {}) {
    const {
        maxRetries = 3,
        backoff = 100, // Initial backoff in ms
        exponential = true,
        onError = null,
        context = 'operation'
    } = options;

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            if (onError) {
                onError(error, attempt, maxRetries);
            } else {
                logError(error, { attempt, maxRetries, context }, 'warn', 'RetryHandler');
            }

            if (attempt === maxRetries) {
                break;
            }

            // Calculate backoff time
            const delay = exponential 
                ? backoff * Math.pow(2, attempt) 
                : backoff;
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw new CustomErrors.RuntimeError(
        `${context} failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`,
        context,
        { maxRetries, lastError: lastError?.message }
    );
}

/**
 * Creates a safe wrapper for a function that handles errors gracefully
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Wrapper options
 * @returns {Function} Wrapped function
 */
export function createSafeWrapper(fn, options = {}) {
    const { 
        defaultValue = null, 
        context = 'wrapped-function', 
        logErrors = true 
    } = options;

    return async (...args) => {
        try {
            return await Promise.resolve(fn(...args));
        } catch (error) {
            if (logErrors) {
                logError(error, { context, args: args.length }, 'warn', 'SafeWrapper');
            }
            return defaultValue;
        }
    };
}