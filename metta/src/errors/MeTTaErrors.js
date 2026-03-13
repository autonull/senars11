/**
 * MeTTaErrors.js - Enhanced error types with context and suggestions
 */

/**
 * Base MeTTa error with enhanced context
 */
export class MeTTaError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = this.constructor.name;
        this.context = context;
        this.timestamp = new Date().toISOString();
        this.suggestion = null;
    }

    withSuggestion(suggestion) {
        this.suggestion = suggestion;
        return this;
    }

    toString() {
        let msg = `${this.name}: ${this.message}`;
        if (this.context && Object.keys(this.context).length > 0) {
            msg += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
        }
        if (this.suggestion) {
            msg += `\nSuggestion: ${this.suggestion}`;
        }
        return msg;
    }
}

/**
 * Operation not found with fuzzy matching suggestions
 */
export class OperationNotFoundError extends MeTTaError {
    constructor(operationName, context = {}) {
        const { availableOps = [] } = context;
        const similar = this._findSimilar(operationName, availableOps);
        const message = similar.length > 0
            ? `Operation '${operationName}' not found. Did you mean: ${similar.join(', ')}?`
            : `Operation '${operationName}' not found`;

        super(message, { ...context, operationName });
        this.suggestion = 'Check the operation name or use (help) to list available operations';
    }

    _findSimilar(name, available) {
        return available
            .filter(op => op.includes(name) || name.includes(op) || levenshteinDistance(name, op) <= 2)
            .slice(0, 5);
    }
}

/**
 * Type error with expected/actual information
 */
export class TypeError extends MeTTaError {
    constructor(message, expected, actual, context = {}) {
        super(message, { ...context, expected, actual });
        this.expected = expected;
        this.actual = actual;
        this.suggestion = `Expected ${expected}, but got ${actual}`;
    }
}

/**
 * Reduction error with step information
 */
export class ReductionError extends MeTTaError {
    constructor(message, atom, step, limit, context = {}) {
        super(message, { ...context, atom: atom?.toString(), step, limit });
        this.atom = atom;
        this.step = step;
        this.limit = limit;

        if (step >= limit) {
            this.suggestion = 'Consider increasing maxReductionSteps or check for infinite recursion';
        }
    }
}

/**
 * Parse error with position information
 */
export class ParseError extends MeTTaError {
    constructor(message, position, source, context = {}) {
        super(message, { ...context, position, source: source?.substring(0, 100) });
        this.position = position;
        this.source = source;

        if (position !== undefined && source) {
            const line = source.substring(0, position).split('\n').length;
            const col = position - source.lastIndexOf('\n', position - 1);
            this.suggestion = `Error at line ${line}, column ${col}`;
        }
    }
}

/**
 * Configuration error with expected type
 */
export class ConfigurationError extends MeTTaError {
    constructor(key, value, expected, context = {}) {
        super(`Invalid configuration for '${key}': ${value}`, { ...context, key, value, expected });
        this.key = key;
        this.value = value;
        this.expected = expected;
        this.suggestion = `Expected ${expected}, got ${typeof value}`;
    }
}

/**
 * Extension error with extension name
 */
export class ExtensionError extends MeTTaError {
    constructor(extensionName, message, context = {}) {
        super(`Extension '${extensionName}' error: ${message}`, { ...context, extensionName });
        this.extensionName = extensionName;
    }
}

/**
 * Resource error for memory, file, etc.
 */
export class ResourceError extends MeTTaError {
    constructor(resourceType, message, context = {}) {
        super(`${resourceType} error: ${message}`, { ...context, resourceType });
        this.resourceType = resourceType;
    }
}

/**
 * Timeout error for long-running operations
 */
export class TimeoutError extends MeTTaError {
    constructor(operation, timeout, context = {}) {
        super(`Operation '${operation}' timed out after ${timeout}ms`, { ...context, operation, timeout });
        this.suggestion = 'Consider increasing the timeout or optimizing the operation';
    }
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
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

/**
 * Format error for display
 */
export function formatError(error) {
    return error instanceof MeTTaError ? error.toString() : `${error.name}: ${error.message}\n${error.stack ?? ''}`;
}

/**
 * Log error with context
 */
export function logError(error, options = {}) {
    const { logger = console, includeStack = false } = options;
    logger.error(formatError(error));
    if (includeStack && error.stack) logger.error(error.stack);
}
