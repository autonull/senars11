/**
 * Error handling utilities for SeNARS
 * Re-exports canonical error classes and provides Logger-based helpers.
 * @deprecated Import error classes from '../errors/index.js' instead.
 * This file provides only Logger-integrated wrappers and re-exports for backward compat.
 */

import { Logger } from './Logger.js';
import { validateSchema } from './validate.js';
import * as Errors from '../errors/index.js';

export * from '../errors/index.js';

export function logError(error, context = {}, level = 'error', component = '') {
    try {
        const logFunc = Logger[level] || Logger.error;
        const errorMessage = typeof error === 'string' ? error : error?.message || 'Unknown error';
        const logContext = { component, timestamp: new Date().toISOString(), ...context };
        if (typeof error !== 'string' && error) {
            logContext.errorDetails = { name: error.name, message: error.message, stack: error?.stack, code: error.code, timestamp: error.timestamp };
        }
        logFunc(`[${component ? component + ' - ' : ''}Error] ${errorMessage}`, logContext);
    } catch {
        console.error(`[${component ? component + ' - ' : ''}Error] ${typeof error === 'string' ? error : error?.message || 'Unknown error'}`, context);
    }
}

export function logDetailedError(error, metadata = {}, component = '') {
    try {
        const errorObj = typeof error === 'string' ? new Error(error) : error;
        Logger.error(`[${component ? component + ' - ' : ''}Detailed Error] ${errorObj.message}`, { component, timestamp: new Date().toISOString(), ...metadata, errorType: errorObj?.constructor?.name });
    } catch {
        console.error(`[${component ? component + ' - ' : ''}Detailed Error] ${typeof error === 'string' ? error : error?.message || 'Unknown error'}`, metadata);
    }
}

export function createErrorHandler(componentName = '') {
    return {
        logError: (error, context = {}, level = 'error') => logError(error, context, level, componentName),
        safeAsync: async (asyncFn, context = '', contextInfo = {}, defaultValue = null) => safeAsync(asyncFn, `${componentName} - ${context}`, contextInfo, defaultValue),
        safeSync: (syncFn, context = '', contextInfo = {}, defaultValue = null) => safeSync(syncFn, `${componentName} - ${context}`, contextInfo, defaultValue),
        executeWithHandling: async (operation, context = '', options = {}) => executeWithHandling(operation, context, componentName, options),
        executeSyncWithHandling: (operation, context = '', options = {}) => executeSyncWithHandling(operation, context, componentName, options),
        wrapError: (error, message, context = {}) => wrapError(error, message, { ...context, component: componentName })
    };
}

export async function safeAsync(asyncFn, context = '', contextInfo = {}, defaultValue = null) {
    try { return await asyncFn(); }
    catch (error) { logError(error, { ...contextInfo, context }, 'error', context.split(' ')[0]); return defaultValue; }
}

export function safeSync(syncFn, context = '', contextInfo = {}, defaultValue = null) {
    try { return syncFn(); }
    catch (error) { logError(error, { ...contextInfo, context }, 'error', context.split(' ')[0]); return defaultValue; }
}

export async function safeExecute(operation, options = {}) {
    const { defaultValue = null, errorHandler = null, context = 'safe-execute', logErrors = true } = options;
    try { return await Promise.resolve(operation()); }
    catch (error) { if (errorHandler) return errorHandler(error); if (logErrors) logError(error, { context }, 'error', 'SafeExecute'); return defaultValue; }
}

export function safeExecuteSync(operation, options = {}) {
    const { defaultValue = null, errorHandler = null, context = 'safe-execute', logErrors = true } = options;
    try { return operation(); }
    catch (error) { if (errorHandler) return errorHandler(error); if (logErrors) logError(error, { context }, 'error', 'SafeExecute'); return defaultValue; }
}

export function wrapError(error, message, context = {}) {
    const wrappedMessage = `${message}: ${error?.message || error}`;
    const newError = new Error(wrappedMessage);
    if (error instanceof Error) newError.cause = error;
    newError.context = context;
    newError.originalError = error;
    return newError;
}

export async function executeWithHandling(operation, context = '', component = '', options = {}) {
    const { logLevel = 'error', logOnSuccess = false, defaultValue = null, throwOnError = false } = options;
    try {
        const result = await operation();
        if (logOnSuccess) { try { Logger.info(`[${component}] ${context} completed successfully`); } catch { console.info(`[${component}] ${context} completed successfully`); } }
        return result;
    } catch (error) {
        if (throwOnError) throw wrapError(error, `${context} failed: ${error.message}`, { context });
        logError(error, { context }, logLevel, component);
        return defaultValue;
    }
}

export function executeSyncWithHandling(operation, context = '', component = '', options = {}) {
    const { logLevel = 'error', logOnSuccess = false, defaultValue = null, throwOnError = false } = options;
    try {
        const result = operation();
        if (logOnSuccess) { try { Logger.info(`[${component}] ${context} completed successfully`); } catch { console.info(`[${component}] ${context} completed successfully`); } }
        return result;
    } catch (error) {
        if (throwOnError) throw wrapError(error, `${context} failed: ${error.message}`, { context });
        logError(error, { context }, logLevel, component);
        return defaultValue;
    }
}

export async function withRetry(operation, options = {}) {
    const { maxRetries = 3, backoff = 100, exponential = true, onError = null, context = 'operation' } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try { return await operation(); }
        catch (error) {
            lastError = error;
            if (onError) onError(error, attempt, maxRetries);
            else logError(error, { attempt, maxRetries, context }, 'warn', 'RetryHandler');
            if (attempt === maxRetries) break;
            await new Promise(resolve => setTimeout(resolve, exponential ? backoff * Math.pow(2, attempt) : backoff));
        }
    }
    throw new Errors.RuntimeError(`${context} failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`, { details: { maxRetries, lastError: lastError?.message } });
}

export function createSafeWrapper(fn, options = {}) {
    const { defaultValue = null, context = 'wrapped-function', logErrors = true } = options;
    return async (...args) => {
        try { return await Promise.resolve(fn(...args)); }
        catch (error) { if (logErrors) logError(error, { context, args: args.length }, 'warn', 'SafeWrapper'); return defaultValue; }
    };
}

export function formatError(error, options = {}) {
    const { includeStack = false, includeDetails = true, prefix = '' } = options;
    if (!error) return `${prefix}Unknown error`;
    let message = `${prefix}${error.name}: ${error.message}`;
    if (includeDetails && error.details) message += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    if (includeStack && error.stack) message += `\n${error.stack}`;
    return message;
}

export function validateParams(params, schema, operation = 'operation') {
    return validateSchema(params, schema, operation);
}
