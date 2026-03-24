/**
 * Guard utilities for SeNARS
 */

import { Logger } from './Logger.js';

/**
 * Execute guarded operation with standardized error handling
 * @param {Function} guard - Guard function
 * @param {Function} execute - Execute function
 * @param {Object} options - Options
 * @param {*} options.defaultValue - Default value on failure
 * @param {boolean} options.throwOnGuardFailure - Throw on guard failure
 * @param {Function} options.errorHandler - Custom error handler
 * @param {string} options.context - Context for logging
 * @returns {*} Result of execution or default value
 */
export async function executeGuarded(guard, execute, options = {}) {
    const { defaultValue = null, throwOnGuardFailure = false, errorHandler = null, context = 'guarded-execution' } = options;

    let guardResult;
    try {
        guardResult = await Promise.resolve(guard());
    } catch (guardError) {
        return errorHandler ? errorHandler(guardError, 'guard') : (Logger.error(`[${context}] Guard evaluation failed`, guardError), defaultValue);
    }

    const isValid = typeof guardResult === 'boolean' ? guardResult : guardResult?.isValid;
    const errors = guardResult?.errors;

    if (!isValid) {
        if (throwOnGuardFailure) {
            const error = new Error(`Guard failed: ${errors?.join(', ') || 'conditions not met'}`);
            error.guardErrors = errors;
            throw error;
        }
        if (errors?.length > 0) Logger.warn(`[${context}] Guard failed`, { errors });
        return defaultValue;
    }

    try {
        return await Promise.resolve(execute());
    } catch (execError) {
        return errorHandler ? errorHandler(execError, 'execute') : (Logger.error(`[${context}] Execution failed`, execError), defaultValue);
    }
}

/**
 * Sync version of executeGuarded
 * @param {Function} guard - Guard function
 * @param {Function} execute - Execute function
 * @param {Object} options - Options
 * @param {*} options.defaultValue - Default value on failure
 * @param {boolean} options.throwOnGuardFailure - Throw on guard failure
 * @param {Function} options.errorHandler - Custom error handler
 * @param {string} options.context - Context for logging
 * @returns {*} Result of execution or default value
 */
export function executeGuardedSync(guard, execute, options = {}) {
    const { defaultValue = null, throwOnGuardFailure = false, errorHandler = null, context = 'guarded-execution' } = options;

    let guardResult;
    try {
        guardResult = guard();
    } catch (guardError) {
        return errorHandler ? errorHandler(guardError, 'guard') : (Logger.error(`[${context}] Guard evaluation failed`, guardError), defaultValue);
    }

    const isValid = typeof guardResult === 'boolean' ? guardResult : guardResult?.isValid;
    const errors = guardResult?.errors;

    if (!isValid) {
        if (throwOnGuardFailure) {
            const error = new Error(`Guard failed: ${errors?.join(', ') || 'conditions not met'}`);
            error.guardErrors = errors;
            throw error;
        }
        if (errors?.length > 0) Logger.warn(`[${context}] Guard failed`, { errors });
        return defaultValue;
    }

    try {
        return execute();
    } catch (execError) {
        return errorHandler ? errorHandler(execError, 'execute') : (Logger.error(`[${context}] Execution failed`, execError), defaultValue);
    }
}

/**
 * Abstract base class for guarded execution pattern
 */
export class GuardedExecutor {
    /**
     * Check if execution is allowed
     * @returns {boolean|Object} True or result object with isValid
     */
    canExecute() {
        return true;
    }

    /**
     * Execute the operation
     * @returns {Promise<*>} Result of execution
     */
    async execute() {
        throw new Error('execute() must be implemented by subclass');
    }

    /**
     * Run with guard
     * @param {Object} options - Options for guarded execution
     * @returns {Promise<*>} Result of execution or default value
     */
    async run(options = {}) {
        return executeGuarded(() => this.canExecute(), () => this.execute(), { context: this.constructor.name, ...options });
    }

    /**
     * Run sync with guard
     * @param {Object} options - Options for guarded execution
     * @returns {*} Result of execution or default value
     */
    runSync(options = {}) {
        return executeGuardedSync(() => this.canExecute(), () => this.execute(), { context: this.constructor.name, ...options });
    }
}
