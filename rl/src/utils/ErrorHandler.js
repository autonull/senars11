export class NeuroSymbolicError extends Error {
    constructor(message, code = 'NEUROSYMBOLIC_ERROR', context = {}) {
        super(message);
        this.name = 'NeuroSymbolicError';
        this.code = code;
        this.context = context;
        this.timestamp = Date.now();
    }

    static wrap(error, message, context = {}) {
        return new NeuroSymbolicError(
            `${message}: ${error.message}`,
            'WRAPPED_ERROR',
            { ...context, originalError: error }
        );
    }

    static component(component, message, context = {}) {
        return new NeuroSymbolicError(message, `COMPONENT_${component.toUpperCase()}`, context);
    }

    static configuration(key, value, expected) {
        return new NeuroSymbolicError(
            `Invalid configuration for ${key}`,
            'CONFIGURATION_ERROR',
            { key, value, expected }
        );
    }

    static unavailable(component, reason) {
        return new NeuroSymbolicError(
            `${component} unavailable`,
            'COMPONENT_UNAVAILABLE',
            { component, reason }
        );
    }
}

export function handleError(error, context = {}, logger = console) {
    const neuroError = error instanceof NeuroSymbolicError
        ? error
        : NeuroSymbolicError.wrap(error, 'Operation failed', context);

    logger.error('[NeuroSymbolicError]', {
        code: neuroError.code,
        message: neuroError.message,
        context: neuroError.context,
        timestamp: neuroError.timestamp
    });

    return neuroError;
}

export function validateConfig(config, schema, defaults = {}) {
    const validated = { ...defaults };

    for (const [key, validator] of Object.entries(schema)) {
        const value = config[key];

        if (value === undefined) {
            validated[key] = defaults[key];
        } else if (typeof validator === 'function') {
            if (!validator(value)) {
                throw NeuroSymbolicError.configuration(key, value, validator.name);
            }
            validated[key] = value;
        } else if (typeof validator === 'object' && validator.type) {
            if (typeof value !== validator.type) {
                throw NeuroSymbolicError.configuration(key, value, `type: ${validator.type}`);
            }
            validated[key] = value;
        } else {
            validated[key] = value;
        }
    }

    return validated;
}
