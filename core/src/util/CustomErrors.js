/**
 * Custom error classes for SeNARS
 * Following AGENTS.md guidelines for error handling
 */

export class SeNARSError extends Error {
    constructor(message, code = 'SE_NARS_ERROR', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
        this.timestamp = Date.now();
        
        // Maintaining proper prototype chain for ES2015 classes
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export class ValidationError extends SeNARSError {
    constructor(message, field = null, value = null) {
        super(message, 'VALIDATION_ERROR', { field, value });
        this.field = field;
        this.value = value;
    }
}

export class ConfigurationError extends SeNARSError {
    constructor(message, configKey = null, configValue = null) {
        super(message, 'CONFIGURATION_ERROR', { configKey, configValue });
        this.configKey = configKey;
        this.configValue = configValue;
    }
}

export class RuntimeError extends SeNARSError {
    constructor(message, operation = null, context = null) {
        super(message, 'RUNTIME_ERROR', { operation, context });
        this.operation = operation;
        this.context = context;
    }
}

export class SerializationError extends SeNARSError {
    constructor(message, entityType = null, entityData = null) {
        super(message, 'SERIALIZATION_ERROR', { entityType, entityData });
        this.entityType = entityType;
        this.entityData = entityData;
    }
}

export class DeserializationError extends SeNARSError {
    constructor(message, entityType = null, entityData = null) {
        super(message, 'DESERIALIZATION_ERROR', { entityType, entityData });
        this.entityType = entityType;
        this.entityData = entityData;
    }
}

export class ResourceError extends SeNARSError {
    constructor(message, resourceType = null, resourceId = null) {
        super(message, 'RESOURCE_ERROR', { resourceType, resourceId });
        this.resourceType = resourceType;
        this.resourceId = resourceId;
    }
}