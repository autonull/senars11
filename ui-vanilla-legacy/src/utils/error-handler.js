/**
 * ErrorHandler - Centralized error handling and logging system
 */
import Logger from './logger.js';
import configManager from '../config/config-manager.js';

class ErrorHandler {
    constructor() {
        this.errorListeners = [];
        this.errorQueue = [];
        this.maxErrorQueueSize = 100;
        this.reportingEnabled = configManager.getEnableConsoleLogging();
    }

    /**
     * Handle an error by logging it and notifying listeners
     */
    handleError(error, context = {}, options = {}) {
        const errorDetails = this._extractErrorDetails(error, context);
        
        // Store in queue for reporting
        this._addToErrorQueue(errorDetails);
        
        // Log the error based on configuration
        this._logError(errorDetails, options);
        
        // Notify listeners
        this._notifyErrorListeners(errorDetails);
        
        // Potentially send error to external service if configured
        if (this.reportingEnabled && options.report !== false) {
            this._reportError(errorDetails);
        }
        
        return errorDetails;
    }

    /**
     * Centralized method to log different levels of errors
     */
    _logError(errorDetails, options = {}) {
        const level = options.level || 'error';
        const message = errorDetails.message || errorDetails.toString();
        
        switch (level) {
            case 'error':
                Logger.error(message, errorDetails);
                break;
            case 'warn':
                Logger.warn(message, errorDetails);
                break;
            case 'info':
                Logger.info(message, errorDetails);
                break;
            case 'debug':
                Logger.debug(message, errorDetails);
                break;
            default:
                Logger.error(message, errorDetails);
        }
    }

    /**
     * Extract structured error information
     */
    _extractErrorDetails(error, context = {}) {
        let errorObj;
        if (typeof error === 'string') {
            errorObj = { message: error };
        } else if (error instanceof Error) {
            errorObj = {
                message: error.message,
                stack: error.stack,
                name: error.name,
                cause: error.cause
            };
        } else {
            errorObj = { ...error };
        }

        return {
            id: this._generateErrorId(),
            timestamp: new Date().toISOString(),
            ...errorObj,
            context: { ...context },
            userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : 'server',
            url: typeof window !== 'undefined' ? window.location?.href : 'server'
        };
    }

    /**
     * Generate a unique error ID
     */
    _generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Add error to queue (with max size limit)
     */
    _addToErrorQueue(errorDetails) {
        this.errorQueue.unshift(errorDetails);
        if (this.errorQueue.length > this.maxErrorQueueSize) {
            this.errorQueue = this.errorQueue.slice(0, this.maxErrorQueueSize);
        }
    }

    /**
     * Register a listener for error events
     */
    addErrorListener(listener) {
        if (typeof listener === 'function') {
            this.errorListeners.push(listener);
            return () => this.removeErrorListener(listener);
        }
    }

    /**
     * Remove a listener
     */
    removeErrorListener(listener) {
        const index = this.errorListeners.indexOf(listener);
        if (index > -1) {
            this.errorListeners.splice(index, 1);
        }
    }

    /**
     * Notify all error listeners
     */
    _notifyErrorListeners(errorDetails) {
        for (const listener of this.errorListeners) {
            try {
                listener(errorDetails);
            } catch (notificationError) {
                // Don't let error notification cause more errors
                console.error('Error in error listener:', notificationError);
            }
        }
    }

    /**
     * Report error to external service (placeholder implementation)
     */
    _reportError(errorDetails) {
        // In a real implementation, this would send errors to services like Sentry, etc.
        // For now, we log to console based on configuration
        if (configManager.getLoggingLevel() === 'debug') {
            console.group('Error Reporting');
            console.log('Reporting error:', errorDetails);
            console.groupEnd();
        }
    }

    /**
     * Try-catch wrapper for centralized error handling
     */
    tryCatch(promiseOrFunction, context = {}, options = {}) {
        if (typeof promiseOrFunction === 'function') {
            try {
                const result = promiseOrFunction();
                return result;
            } catch (error) {
                return this.handleError(error, context, options);
            }
        } else if (promiseOrFunction && typeof promiseOrFunction.catch === 'function') {
            return promiseOrFunction.catch(error => {
                this.handleError(error, context, options);
                return Promise.reject(error);
            });
        }
        return promiseOrFunction;
    }

    /**
     * Get recent errors
     */
    getRecentErrors(limit = 10) {
        return this.errorQueue.slice(0, limit);
    }

    /**
     * Clear error queue
     */
    clearErrorQueue() {
        this.errorQueue = [];
    }

    /**
     * Enable/disable error reporting
     */
    setReportingEnabled(enabled) {
        this.reportingEnabled = enabled;
    }
}

// Create a singleton instance
const errorHandler = new ErrorHandler();
export default errorHandler;