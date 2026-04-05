/**
 * Error handling utilities for SeNARS
 * Re-exports canonical error classes and provides Logger-based helpers.
 * @deprecated Import error classes from '../errors/index.js' instead.
 * This file provides only Logger-integrated wrappers and re-exports for backward compat.
 */

import {Logger} from './Logger.js';
import {validateSchema} from './validate.js';
import {retry as _retry} from './async.js';

export * from '../errors/index.js';

export function logError(error, context = {}, level = 'error', component = '') {
    try {
        const logFunc = Logger[level] ?? Logger.error;
        const msg = typeof error === 'string' ? error : error?.message ?? 'Unknown error';
        const prefix = component ? `[${component} - Error] ` : '[Error] ';
        const logContext = {component, timestamp: new Date().toISOString(), ...context};
        if (typeof error !== 'string' && error) {
            logContext.errorDetails = {
                name: error.name,
                message: error.message,
                stack: error?.stack,
                code: error.code,
                timestamp: error.timestamp
            };
        }
        logFunc(`${prefix}${msg}`, logContext);
    } catch {
        console.error(`[Error] ${typeof error === 'string' ? error : error?.message ?? 'Unknown error'}`, context);
    }
}

export function logDetailedError(error, metadata = {}, component = '') {
    try {
        const errorObj = typeof error === 'string' ? new Error(error) : error;
        const prefix = component ? `[${component} - Detailed Error] ` : '[Detailed Error] ';
        Logger.error(`${prefix}${errorObj.message}`, {
            component,
            timestamp: new Date().toISOString(), ...metadata,
            errorType: errorObj?.constructor?.name
        });
    } catch {
        console.error(`[Detailed Error] ${typeof error === 'string' ? error : error?.message ?? 'Unknown error'}`, metadata);
    }
}

export function createErrorHandler(componentName = '') {
    return {
        logError: (error, context = {}, level = 'error') => logError(error, context, level, componentName),
        safeAsync: async (asyncFn, context = '', contextInfo = {}, defaultValue = null) => safeAsync(asyncFn, `${componentName} - ${context}`, contextInfo, defaultValue),
        safeSync: (syncFn, context = '', contextInfo = {}, defaultValue = null) => safeSync(syncFn, `${componentName} - ${context}`, contextInfo, defaultValue),
        executeWithHandling: async (operation, context = '', options = {}) => executeWithHandling(operation, context, componentName, options),
        executeSyncWithHandling: (operation, context = '', options = {}) => executeSyncWithHandling(operation, context, componentName, options),
        wrapError: (error, message, context = {}) => wrapError(error, message, {...context, component: componentName})
    };
}

export async function safeAsync(asyncFn, context = '', contextInfo = {}, defaultValue = null) {
    try {
        return await asyncFn();
    } catch (error) {
        logError(error, {...contextInfo, context}, 'error', context.split(' ')[0]);
        return defaultValue;
    }
}

export function safeSync(syncFn, context = '', contextInfo = {}, defaultValue = null) {
    try {
        return syncFn();
    } catch (error) {
        logError(error, {...contextInfo, context}, 'error', context.split(' ')[0]);
        return defaultValue;
    }
}

export function safeExecute(operation, options = {}) {
    const {defaultValue = null, errorHandler = null, context = 'safe-execute'} = options;
    return safeAsync(operation, context, {}, errorHandler ?? defaultValue);
}

export function safeExecuteSync(operation, options = {}) {
    const {defaultValue = null, errorHandler = null, context = 'safe-execute'} = options;
    return safeSync(operation, context, {}, errorHandler ?? defaultValue);
}

export function wrapError(error, message, context = {}) {
    const wrappedMessage = `${message}: ${error?.message || error}`;
    const newError = new Error(wrappedMessage);
    if (error instanceof Error) {
        newError.cause = error;
    }
    newError.context = context;
    newError.originalError = error;
    return newError;
}

function runWithHandling(operation, context, component, options, isAsync) {
    const {logLevel = 'error', logOnSuccess = false, defaultValue = null, throwOnError = false} = options;
    const runOp = () => isAsync ? Promise.resolve(operation()).then(
        (result) => {
            if (logOnSuccess) {
                Logger.info(`[${component}] ${context} completed successfully`);
            }
            return result;
        },
        (error) => {
            throw error;
        }
    ) : (() => {
        const r = operation();
        if (logOnSuccess) {
            Logger.info(`[${component}] ${context} completed successfully`);
        }
        return r;
    })();

    const handleError = (error) => {
        if (throwOnError) {
            throw wrapError(error, `${context} failed: ${error.message}`, {context});
        }
        logError(error, {context}, logLevel, component);
        return defaultValue;
    };

    try {
        return isAsync ? runOp().catch(handleError) : runOp();
    } catch (error) {
        return handleError(error);
    }
}

export async function executeWithHandling(operation, context = '', component = '', options = {}) {
    return runWithHandling(operation, context, component, options, true);
}

export function executeSyncWithHandling(operation, context = '', component = '', options = {}) {
    return runWithHandling(operation, context, component, options, false);
}

export {_retry as retry};

export async function withRetry(operation, options = {}) {
    const {maxRetries = 3, backoff = 100, exponential = true, onError = null, context = 'operation'} = options;
    return _retry(operation, {
        maxRetries, backoff, exponential,
        onError: onError ?? ((error, attempt) => logError(error, {attempt, context}, 'warn', 'RetryHandler'))
    });
}

export function createSafeWrapper(fn, options = {}) {
    const {defaultValue = null, context = 'wrapped-function'} = options;
    return async (...args) => {
        try {
            return await Promise.resolve(fn(...args));
        } catch (error) {
            logError(error, {context, args: args.length}, 'warn', 'SafeWrapper');
            return defaultValue;
        }
    };
}

export function formatError(error, options = {}) {
    const {includeStack = false, includeDetails = true, prefix = ''} = options;
    if (!error) {
        return `${prefix}Unknown error`;
    }
    let message = `${prefix}${error.name}: ${error.message}`;
    if (includeDetails && error.details) {
        message += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    }
    if (includeStack && error.stack) {
        message += `\n${error.stack}`;
    }
    return message;
}

export function validateParams(params, schema, operation = 'operation') {
    return validateSchema(params, schema, operation);
}

/**
 * @deprecated Use createErrorHandler() directly. Kept for backward compatibility.
 */
export class ErrorHandler {
    #h;

    constructor(componentName = '') {
        this.#h = createErrorHandler(componentName);
    }

    logError(error, context = {}, level = 'error') {
        return this.#h.logError(error, context, level);
    }

    wrapError(error, message, context = {}) {
        return this.#h.wrapError(error, message, context);
    }

    async safeAsync(asyncFn, context = '', contextInfo = {}, defaultValue = null) {
        return this.#h.safeAsync(asyncFn, context, contextInfo, defaultValue);
    }

    safeSync(syncFn, context = '', contextInfo = {}, defaultValue = null) {
        return this.#h.safeSync(syncFn, context, contextInfo, defaultValue);
    }

    async executeWithHandling(operation, context = '', options = {}) {
        return this.#h.executeWithHandling(operation, context, options);
    }

    executeSyncWithHandling(operation, context = '', options = {}) {
        return this.#h.executeSyncWithHandling(operation, context, options);
    }
}
