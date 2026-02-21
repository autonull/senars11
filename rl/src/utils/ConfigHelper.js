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
