/**
 * Guarded execution utilities for SeNARS
 */

import {Logger} from './Logger.js';

/**
 * Execute guarded operation with standardized error handling
 */
export async function executeGuarded(guard, execute, options = {}) {
    const {
        defaultValue = null,
        throwOnGuardFailure = false,
        errorHandler = null,
        context = 'guarded-execution'
    } = options;

    let guardResult;
    try {
        guardResult = await Promise.resolve(guard());
    } catch (guardError) {
        return errorHandler
            ? errorHandler(guardError, 'guard')
            : (Logger.error(`[${context}] Guard evaluation failed`, guardError), defaultValue);
    }

    const isValid = typeof guardResult === 'boolean' ? guardResult : guardResult?.isValid;
    const errors = guardResult?.errors;

    if (!isValid) {
        if (throwOnGuardFailure) {
            const error = new Error(`Guard failed: ${errors?.join(', ') || 'conditions not met'}`);
            error.guardErrors = errors;
            throw error;
        }
        if (errors?.length > 0) {
            Logger.warn(`[${context}] Guard failed`, {errors});
        }
        return defaultValue;
    }

    try {
        return await Promise.resolve(execute());
    } catch (execError) {
        return errorHandler
            ? errorHandler(execError, 'execute')
            : (Logger.error(`[${context}] Execution failed`, execError), defaultValue);
    }
}

/**
 * Sync version of executeGuarded
 */
export function executeGuardedSync(guard, execute, options = {}) {
    const {
        defaultValue = null,
        throwOnGuardFailure = false,
        errorHandler = null,
        context = 'guarded-execution'
    } = options;

    let guardResult;
    try {
        guardResult = guard();
    } catch (guardError) {
        return errorHandler
            ? errorHandler(guardError, 'guard')
            : (Logger.error(`[${context}] Guard evaluation failed`, guardError), defaultValue);
    }

    const isValid = typeof guardResult === 'boolean' ? guardResult : guardResult?.isValid;
    const errors = guardResult?.errors;

    if (!isValid) {
        if (throwOnGuardFailure) {
            const error = new Error(`Guard failed: ${errors?.join(', ') || 'conditions not met'}`);
            error.guardErrors = errors;
            throw error;
        }
        if (errors?.length > 0) {
            Logger.warn(`[${context}] Guard failed`, {errors});
        }
        return defaultValue;
    }

    try {
        return execute();
    } catch (execError) {
        return errorHandler
            ? errorHandler(execError, 'execute')
            : (Logger.error(`[${context}] Execution failed`, execError), defaultValue);
    }
}

/**
 * Safe execution wrapper with default return on error
 */
export async function safeExecute(operation, options = {}) {
    const {
        defaultValue = null,
        errorHandler = null,
        context = 'safe-execute'
    } = options;

    try {
        return await Promise.resolve(operation());
    } catch (error) {
        return errorHandler
            ? errorHandler(error)
            : (Logger.error(`[${context}] Operation failed`, error), defaultValue);
    }
}

/**
 * Sync version of safeExecute
 */
export function safeExecuteSync(operation, options = {}) {
    const {
        defaultValue = null,
        errorHandler = null,
        context = 'safe-execute'
    } = options;

    try {
        return operation();
    } catch (error) {
        return errorHandler
            ? errorHandler(error)
            : (Logger.error(`[${context}] Operation failed`, error), defaultValue);
    }
}

/**
 * Abstract base class for guarded execution pattern
 */
export class GuardedExecutor {
    canExecute() {
        return true;
    }

    async execute() {
        throw new Error('execute() must be implemented by subclass');
    }

    async run(options = {}) {
        return executeGuarded(
            () => this.canExecute(),
            () => this.execute(),
            {context: this.constructor.name, ...options}
        );
    }

    runSync(options = {}) {
        return executeGuardedSync(
            () => this.canExecute(),
            () => this.execute(),
            {context: this.constructor.name, ...options}
        );
    }
}
