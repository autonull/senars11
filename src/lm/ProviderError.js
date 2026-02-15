/**
 * @file ProviderError.js
 * @description Comprehensive error classes for provider operations
 */

export class ProviderError extends Error {
    constructor(message, code = 'PROVIDER_ERROR', originalError = null) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export class ConfigurationError extends ProviderError {
    constructor(message, configKey = null) {
        super(message, 'CONFIG_ERROR');
        this.configKey = configKey;
    }
}

export class InitializationError extends ProviderError {
    constructor(message, providerType = null) {
        super(message, 'INIT_ERROR');
        this.providerType = providerType;
    }
}

export class ConnectionError extends ProviderError {
    constructor(message, providerType = null, endpoint = null) {
        super(message, 'CONNECTION_ERROR');
        this.providerType = providerType;
        this.endpoint = endpoint;
    }
}

export class ModelNotFoundError extends ProviderError {
    constructor(modelName) {
        super(`Model "${modelName}" not found`, 'MODEL_NOT_FOUND');
        this.modelName = modelName;
    }
}

export class TimeoutError extends ProviderError {
    constructor(operation, timeout) {
        super(`Operation "${operation}" timed out after ${timeout}ms`, 'TIMEOUT_ERROR');
        this.operation = operation;
        this.timeout = timeout;
    }
}

export class ToolExecutionError extends ProviderError {
    constructor(message, toolName = null, input = null) {
        super(message, 'TOOL_EXECUTION_ERROR');
        this.toolName = toolName;
        this.input = input;
    }
}

export class ValidationError extends ProviderError {
    constructor(message, field = null, value = null) {
        super(message, 'VALIDATION_ERROR');
        this.field = field;
        this.value = value;
    }
}