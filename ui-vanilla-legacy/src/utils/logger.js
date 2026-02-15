/**
 * Logger utility for consistent error handling and debugging
 * Enhanced to work with centralized ErrorHandler
 */
import configManager from '../config/config-manager.js';

class Logger {
    static log(level, message, context = null) {
        const timestamp = new Date().toISOString();
        const logEntry = context
            ? `[${timestamp}] ${level}: ${message} | Context: ${JSON.stringify(context)}`
            : `[${timestamp}] ${level}: ${message}`;

        // Check if logging level is enabled
        const currentLogLevel = this._getLogLevelPriority(configManager.getLoggingLevel());
        const messageLogLevel = this._getLogLevelPriority(level);

        if (messageLogLevel >= currentLogLevel) {
            if (level === 'ERROR') {
                console.error(logEntry);
            } else if (level === 'WARN') {
                console.warn(logEntry);
            } else if (level === 'DEBUG') {
                // Only log debug messages based on config
                if (configManager.getLoggingLevel() === 'debug') {
                    console.debug(logEntry);
                }
            } else {
                console.log(logEntry);
            }
        }
    }

    static _getLogLevelPriority(level) {
        const priorities = {
            'error': 0,
            'warn': 1,
            'info': 2,
            'debug': 3
        };
        return priorities[level.toLowerCase()] ?? 2; // default to 'info'
    }

    static error(message, context = null) {
        this.log('ERROR', message, context);
    }

    static warn(message, context = null) {
        this.log('WARN', message, context);
    }

    static info(message, context = null) {
        this.log('INFO', message, context);
    }

    static debug(message, context = null) {
        this.log('DEBUG', message, context);
    }
}

export default Logger;