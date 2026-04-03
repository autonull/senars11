/**
 * Unified error hierarchy for SeNARS
 * Consolidates CustomErrors, ProviderError, AnalyzerErrors, ReasonerError, and MeTTaErrors
 */

export class SeNARSError extends Error {
    constructor(message, { code = 'SE_NARS_ERROR', details = null, originalError = null } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
        this.originalError = originalError;
        this.timestamp = Date.now();
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        if (originalError?.stack) {
            this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
        }
    }
}

// Core errors
export class ValidationError extends SeNARSError {
    constructor(message, { field = null, value = null, ...rest } = {}) {
        super(message, { code: 'VALIDATION_ERROR', details: { field, value }, ...rest });
        this.field = field;
        this.value = value;
    }
}

export class ConfigurationError extends SeNARSError {
    constructor(message, { key = null, value = null, expected = null, ...rest } = {}) {
        super(message, { code: 'CONFIGURATION_ERROR', details: { key, value, expected }, ...rest });
        this.key = key;
        this.value = value;
        this.expected = expected;
    }
}

export class ParseError extends SeNARSError {
    constructor(message, { position = null, source = null, ...rest } = {}) {
        super(message, { code: 'PARSE_ERROR', details: { position, source: source?.substring(0, 100) }, ...rest });
        this.position = position;
        this.source = source;
    }
}

export class ConnectionError extends SeNARSError {
    constructor(message, { providerType = null, endpoint = null, ...rest } = {}) {
        super(message, { code: 'CONNECTION_ERROR', details: { providerType, endpoint }, ...rest });
        this.providerType = providerType;
        this.endpoint = endpoint;
    }
}

export class ResourceError extends SeNARSError {
    constructor(message, { resourceType = null, resourceId = null, ...rest } = {}) {
        super(message, { code: 'RESOURCE_ERROR', details: { resourceType, resourceId }, ...rest });
        this.resourceType = resourceType;
        this.resourceId = resourceId;
    }
}

export class TimeoutError extends SeNARSError {
    constructor(message, { operation = null, timeout = null, ...rest } = {}) {
        super(message, { code: 'TIMEOUT_ERROR', details: { operation, timeout }, ...rest });
        this.operation = operation;
        this.timeout = timeout;
    }
}

export class RuntimeError extends SeNARSError {
    constructor(message, { operation = null, context = null, ...rest } = {}) {
        super(message, { code: 'RUNTIME_ERROR', details: { operation, context }, ...rest });
        this.operation = operation;
        this.context = context;
    }
}

export class SerializationError extends SeNARSError {
    constructor(message, { entityType = null, entityData = null, ...rest } = {}) {
        super(message, { code: 'SERIALIZATION_ERROR', details: { entityType, entityData }, ...rest });
        this.entityType = entityType;
        this.entityData = entityData;
    }
}

export class DeserializationError extends SeNARSError {
    constructor(message, { entityType = null, entityData = null, ...rest } = {}) {
        super(message, { code: 'DESERIALIZATION_ERROR', details: { entityType, entityData }, ...rest });
        this.entityType = entityType;
        this.entityData = entityData;
    }
}

// Provider/LM errors
export class ProviderError extends SeNARSError {
    constructor(message, { ...rest } = {}) {
        super(message, { code: 'PROVIDER_ERROR', ...rest });
    }
}

export class ModelNotFoundError extends SeNARSError {
    constructor(modelName) {
        super(`Model '${modelName}' not found`, { code: 'MODEL_NOT_FOUND_ERROR', details: { modelName } });
        this.modelName = modelName;
    }
}

export class InitializationError extends SeNARSError {
    constructor(message, { providerType = null, ...rest } = {}) {
        super(message, { code: 'INIT_ERROR', details: { providerType }, ...rest });
        this.providerType = providerType;
    }
}

export class ToolExecutionError extends SeNARSError {
    constructor(message, { toolName = null, input = null, ...rest } = {}) {
        super(message, { code: 'TOOL_EXECUTION_ERROR', details: { toolName, input }, ...rest });
        this.toolName = toolName;
        this.input = input;
    }
}

// Analyzer errors
export class AnalyzerError extends SeNARSError {
    constructor(message, { ...rest } = {}) {
        super(message, { code: 'ANALYZER_ERROR', ...rest });
    }
}

export class AnalysisError extends SeNARSError {
    constructor(message, { analysisType = 'unknown', ...rest } = {}) {
        super(message, { code: `ANALYSIS_ERROR_${analysisType.toUpperCase()}`, details: { analysisType }, ...rest });
        this.analysisType = analysisType;
    }
}

// Reasoner errors
export class ReasonerError extends SeNARSError {
    constructor(message, { ...rest } = {}) {
        super(message, { code: 'REASONER_ERROR', ...rest });
    }
}

export class RuleExecutionError extends SeNARSError {
    constructor(message, { ruleId = null, ...rest } = {}) {
        super(message, { code: 'RULE_EXECUTION_ERROR', details: { ruleId }, ...rest });
        this.ruleId = ruleId;
    }
}

export class PremiseSourceError extends SeNARSError {
    constructor(message, { sourceType = null, ...rest } = {}) {
        super(message, { code: 'PREMISE_SOURCE_ERROR', details: { sourceType }, ...rest });
        this.sourceType = sourceType;
    }
}

export class StreamProcessingError extends SeNARSError {
    constructor(message, { streamType = null, ...rest } = {}) {
        super(message, { code: 'STREAM_PROCESSING_ERROR', details: { streamType }, ...rest });
        this.streamType = streamType;
    }
}

// MeTTa errors
export class MeTTaError extends SeNARSError {
    #suggestion = null;

    constructor(message, { context = {}, ...rest } = {}) {
        super(message, { code: 'METTA_ERROR', details: context, ...rest });
        this.context = context;
    }

    withSuggestion(suggestion) {
        this.#suggestion = suggestion;
        return this;
    }

    get suggestion() { return this.#suggestion; }

    toString() {
        let msg = `${this.name}: ${this.message}`;
        if (this.context && Object.keys(this.context).length > 0) {
            msg += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
        }
        if (this.#suggestion) msg += `\nSuggestion: ${this.#suggestion}`;
        return msg;
    }
}

export class OperationNotFoundError extends MeTTaError {
    constructor(operationName, { availableOps = [], ...rest } = {}) {
        const similar = findSimilar(operationName, availableOps);
        const message = similar.length > 0
            ? `Operation '${operationName}' not found. Did you mean: ${similar.join(', ')}?`
            : `Operation '${operationName}' not found`;
        super(message, { context: { operationName, availableOps }, ...rest });
        this.withSuggestion('Check the operation name or use (help) to list available operations');
    }
}

export class TypeError extends MeTTaError {
    constructor(message, expected, actual, { context = {}, ...rest } = {}) {
        super(message, { context: { ...context, expected, actual }, ...rest });
        this.expected = expected;
        this.actual = actual;
        this.withSuggestion(`Expected ${expected}, but got ${actual}`);
    }
}

export class ReductionError extends MeTTaError {
    constructor(message, atom, step, limit, { context = {}, ...rest } = {}) {
        super(message, { context: { ...context, atom: atom?.toString(), step, limit }, ...rest });
        this.atom = atom;
        this.step = step;
        this.limit = limit;
        if (step >= limit) {
            this.withSuggestion('Consider increasing maxReductionSteps or check for infinite recursion');
        }
    }
}

export class ExtensionError extends MeTTaError {
    constructor(extensionName, message, { context = {}, ...rest } = {}) {
        super(`Extension '${extensionName}' error: ${message}`, { context: { ...context, extensionName }, ...rest });
        this.extensionName = extensionName;
    }
}

// WebSocket error
export class WebSocketConnectionError extends ConnectionError {
    constructor(message, { ...rest } = {}) {
        super(message, { ...rest });
    }
}

// Utility functions
function findSimilar(name, available) {
    return available
        .filter(op => op.includes(name) || name.includes(op) || levenshteinDistance(name, op) <= 2)
        .slice(0, 5);
}

function levenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
                ? matrix[i - 1][j - 1]
                : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}

export function formatError(error) {
    return error instanceof MeTTaError ? error.toString() : `${error.name}: ${error.message}\n${error.stack ?? ''}`;
}

export function logError(error, { logger = console, includeStack = false } = {}) {
    logger.error(formatError(error));
    if (includeStack && error.stack) logger.error(error.stack);
}

export function tryCatch(fn, ...args) {
    return (typeof fn === 'function' ? fn(...args) : fn)
        .then(result => [null, result])
        .catch(error => [error, null]);
}

export function createErrorHandler(context) {
    return (error, additionalContext = {}) => {
        logError(error, { context: { ...additionalContext, context } });
        throw new ReasonerError(
            `Error in ${context}: ${error.message}`,
            { code: 'CONTEXT_ERROR', originalError: error, details: { context, ...additionalContext } }
        );
    };
}

export function withErrorHandler(fn, context) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            return createErrorHandler(context)(error);
        }
    };
}
