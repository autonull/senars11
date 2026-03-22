/**
 * Standardized error handling utilities for SeNARS
 */
import {ConfigurationError, ConnectionError, ModelNotFoundError, ParseError, SeNARSError} from './CustomErrors.js';
import {Logger} from './Logger.js';

// Re-export for compatibility
export {
    SeNARSError,
    ConnectionError,
    ModelNotFoundError,
    ParseError,
    ConfigurationError
};

// Standard error handler with consistent formatting
export const handleError = (error, context = '', fallbackMessage = 'An error occurred') => {
    // Check for specific error types
    if (error instanceof ModelNotFoundError) {
        return `❌ Model Error: ${error.message}`;
    } else if (error instanceof ConnectionError) {
        return `❌ Connection Error: ${error.message}`;
    } else if (error instanceof ParseError) {
        return `❌ Parse Error: ${error.message}`;
    } else if (error instanceof ConfigurationError) {
        return `❌ Configuration Error: ${error.message}`;
    }

    // Check for specific error patterns
    if (error.message.includes('model') && error.message.includes('not found')) {
        return `❌ Model Error: ${error.message}`;
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        return `❌ Connection Error: ${error.message}`;
    } else if (error.message.includes('Expected end of input')) {
        return `❌ Parse Error: Input may not be valid Narsese syntax`;
    }

    // Return formatted error with context
    return context
        ? `❌ ${context}: ${error.message || fallbackMessage}`
        : `❌ Error: ${error.message || fallbackMessage}`;
};

// Safe execution wrapper with error handling
export const safeExecute = async (operation, context = '', defaultValue = null) => {
    try {
        return await operation();
    } catch (error) {
        Logger.error(`[${context}] Error:`, error);
        return defaultValue;
    }
};

// Error logger with consistent format
export const logError = (error, context = '') => {
    const errorMessage = handleError(error, context);
    Logger.error(`[ERROR] ${new Date().toISOString()} - ${errorMessage}`);
    return errorMessage;
};
