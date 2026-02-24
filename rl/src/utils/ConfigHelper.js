export function mergeConfig(defaults, overrides = {}) {
    return { ...defaults, ...overrides };
}

export function createConfig(schema, overrides = {}) {
    const config = {};

    for (const [key, { default: defaultValue, validate }] of Object.entries(schema)) {
        const value = overrides[key] ?? defaultValue;

        if (validate && !validate(value)) {
            throw new Error(`Invalid config value for ${key}: ${value}`);
        }

        config[key] = value;
    }

    return config;
}

export const ConfigSchema = {
    number: (min = -Infinity, max = Infinity) => ({
        type: 'number',
        validate: (v) => typeof v === 'number' && v >= min && v <= max
    }),
    positiveNumber: () => ({
        type: 'number',
        validate: (v) => typeof v === 'number' && v > 0
    }),
    boolean: () => ({
        type: 'boolean',
        validate: (v) => typeof v === 'boolean'
    }),
    string: () => ({
        type: 'string',
        validate: (v) => typeof v === 'string'
    }),
    array: () => ({
        type: 'object',
        validate: (v) => Array.isArray(v)
    }),
    object: () => ({
        type: 'object',
        validate: (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
    }),
    function: () => ({
        type: 'function',
        validate: (v) => typeof v === 'function'
    }),
    oneOf: (values) => ({
        type: 'enum',
        validate: (v) => values.includes(v)
    }),
    optional: (validator) => ({
        ...validator,
        validate: (v) => v === undefined || validator.validate(v)
    })
};

export function withDefaults(config, defaults) {
    return Object.entries(defaults).reduce(
        (acc, [key, value]) => ({ ...acc, [key]: acc[key] ?? value }),
        config
    );
}

export function extractConfig(config, keys) {
    return keys.reduce((acc, key) => {
        if (key in config) acc[key] = config[key];
        return acc;
    }, {});
}

export function validateConfig(config, schema) {
    const errors = [];

    for (const [key, { validate }] of Object.entries(schema)) {
        if (key in config && validate && !validate(config[key])) {
            errors.push(`Invalid value for ${key}: ${config[key]}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

export function createConfiguredClass(defaults, schema = {}) {
    return class {
        constructor(overrides = {}) {
            const merged = mergeConfig(defaults, overrides);

            if (schema) {
                const { valid, errors } = validateConfig(merged, schema);
                if (!valid) {
                    throw new Error(`Config validation failed: ${errors.join(', ')}`);
                }
            }

            Object.assign(this, merged);
        }
    };
}

export function deepMergeConfig(defaults, overrides = {}) {
    const result = { ...defaults };

    for (const key of Object.keys(overrides)) {
        if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
            result[key] = deepMergeConfig(defaults[key] ?? {}, overrides[key]);
        } else {
            result[key] = overrides[key];
        }
    }

    return result;
}

export class ConfigValidator {
    constructor(schema) {
        this.schema = schema;
    }

    validate(config) {
        return validateConfig(config, this.schema);
    }

    createConfig(overrides = {}) {
        const { valid, errors } = this.validate(overrides);
        if (!valid) {
            throw new Error(`Config validation failed: ${errors.join(', ')}`);
        }
        return overrides;
    }
}
