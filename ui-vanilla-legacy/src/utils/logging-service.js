/**
 * LoggingService - Advanced logging service with centralized configuration and error handling
 */
import Logger from './logger.js';
import errorHandler from './error-handler.js';
import configManager from '../config/config-manager.js';

class LoggingService {
    constructor() {
        this.loggers = new Map();
        this.middleware = [];
        this.logBuffer = [];
        this.maxBufferSize = 1000;
        this.bufferTimeout = 1000; // ms
        this.flushTimer = null;
    }

    /**
     * Create a namespaced logger
     */
    createLogger(namespace) {
        if (!this.loggers.has(namespace)) {
            this.loggers.set(namespace, new NamespaceLogger(namespace));
        }
        return this.loggers.get(namespace);
    }

    /**
     * Log a message with context
     */
    log(level, message, context = {}, namespace = 'default') {
        const logEntry = this._createLogEntry(level, message, context, namespace);
        
        // Apply middleware
        const processedEntry = this._applyMiddleware(logEntry);
        if (!processedEntry) return; // Middleware cancelled log entry
        
        // Buffer the log entry
        this._bufferLogEntry(processedEntry);
        
        // Log immediately based on level
        if (level === 'ERROR') {
            Logger.error(message, context);
            // Also handle as error
            errorHandler.handleError(new Error(message), context);
        } else {
            Logger.log(level, message, context);
        }
    }

    /**
     * Helper methods for different log levels
     */
    error(message, context = {}, namespace = 'default') {
        this.log('ERROR', message, context, namespace);
    }

    warn(message, context = {}, namespace = 'default') {
        this.log('WARN', message, context, namespace);
    }

    info(message, context = {}, namespace = 'default') {
        this.log('INFO', message, context, namespace);
    }

    debug(message, context = {}, namespace = 'default') {
        this.log('DEBUG', message, context, namespace);
    }

    /**
     * Create a structured log entry
     */
    _createLogEntry(level, message, context, namespace) {
        return {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            level,
            message,
            context: { ...context },
            namespace,
            userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : 'server',
            url: typeof window !== 'undefined' ? window.location?.href : 'server'
        };
    }

    /**
     * Apply logging middleware
     */
    _applyMiddleware(logEntry) {
        let processedEntry = logEntry;
        for (const middleware of this.middleware) {
            processedEntry = middleware(processedEntry);
            if (!processedEntry) break; // Middleware cancelled logging
        }
        return processedEntry;
    }

    /**
     * Add middleware function
     */
    use(middleware) {
        if (typeof middleware === 'function') {
            this.middleware.push(middleware);
        }
    }

    /**
     * Buffer log entries to potentially batch or process them
     */
    _bufferLogEntry(logEntry) {
        this.logBuffer.unshift(logEntry);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer = this.logBuffer.slice(0, this.maxBufferSize);
        }
        
        // Set up automatic flush if not already scheduled
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushLogs();
            }, this.bufferTimeout);
        }
    }

    /**
     * Flush buffered logs (for potential external reporting)
     */
    flushLogs() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        
        // In a real implementation, this would send logs to an external service
        // For now, we just clear the buffer
        const logsToFlush = [...this.logBuffer];
        this.logBuffer = [];
        
        return logsToFlush;
    }

    /**
     * Get recent logs
     */
    getRecentLogs(limit = 50) {
        return this.logBuffer.slice(0, limit);
    }

    /**
     * Clear log buffer
     */
    clearLogs() {
        this.logBuffer = [];
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }

    /**
     * Configure logging level dynamically
     */
    setLogLevel(level) {
        configManager.updateConfig({
            logging: {
                level
            }
        });
    }
}

// Namespace logger for modular logging
class NamespaceLogger {
    constructor(namespace) {
        this.namespace = namespace;
    }

    error(message, context = {}) {
        loggingService.log('ERROR', message, context, this.namespace);
    }

    warn(message, context = {}) {
        loggingService.log('WARN', message, context, this.namespace);
    }

    info(message, context = {}) {
        loggingService.log('INFO', message, context, this.namespace);
    }

    debug(message, context = {}) {
        loggingService.log('DEBUG', message, context, this.namespace);
    }
}

// Create a singleton instance
const loggingService = new LoggingService();

export { LoggingService, loggingService, NamespaceLogger };