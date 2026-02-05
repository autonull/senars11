/**
 * Unified Configuration Schema for SeNARS v10
 * Implements validation and standardized configuration patterns for all components
 */

// Default configuration values
export const DEFAULT_CONFIG = {
    // Term Factory Configuration
    termFactory: {
        maxCacheSize: 5000,
        canonicalization: {
            enableAdvancedNormalization: true,
            handleCommutativity: true,
            handleAssociativity: true,
        },
    },

    // Memory Configuration
    memory: {
        focusCapacity: 100,
        bagCapacity: 1000,
        forgettingThreshold: 0.1,
        consolidationInterval: 1000, // milliseconds
    },

    // Reasoning Configuration
    reasoning: {
        maxSteps: 1000,
        priorityThreshold: 0.01,
        revisionThreshold: 0.01,
    },

    // System Configuration
    system: {
        enableLogging: true,
        logLevel: 'INFO', // DEBUG, INFO, WARN, ERROR
        enableMetrics: true,
        aiKRCompliance: true, // Ensure AIKR (Artificial Intelligence Knowledge Representation) compliance
    },

    // Layer Configuration
    layers: {
        termLayerCapacity: 1000,
    },

    // Functor Configuration
    functors: {
        maxExecutionTime: 1000, // milliseconds
        enableSafety: true,
    },
};

/**
 * Configuration validator
 */
import { validateConfigWithDefaults } from './ConfigValidator.js';
import { Logger } from '../util/Logger.js';

export const DEFAULT_CONFIG_CORE = Object.freeze({
    nar: {
        tools: { enabled: true },
        lm: { enabled: false },
        reasoningAboutReasoning: { enabled: true },
        debug: { pipeline: false }
    },
    lm: {
        provider: 'transformers',
        modelName: "Xenova/t5-small",
        baseUrl: "http://localhost:11434",
        temperature: 0,
        enabled: false
    },
    persistence: {
        defaultPath: './agent.json'
    },
    webSocket: {
        port: 8080,
        host: '0.0.0.0',
        maxConnections: 20
    },
    ui: {
        port: 5173,
        layout: 'default',
        dev: true
    }
});

export class Config {
    static parse(argv) {
        if (!argv) {
            if (typeof process !== 'undefined' && process.argv) {
                argv = process.argv.slice(2);
            } else {
                argv = [];
            }
        }
        const config = structuredClone(DEFAULT_CONFIG_CORE);

        // Browser-safe defaults for environment variables
        if (typeof process !== 'undefined' && process.env) {
            if (process.env.WS_PORT) config.webSocket.port = parseInt(process.env.WS_PORT);
            if (process.env.WS_HOST) config.webSocket.host = process.env.WS_HOST;
            if (process.env.PORT) config.ui.port = parseInt(process.env.PORT);
        }

        // Create a copy to avoid modifying original during processing
        const args = [...argv];

        // Define the argument processing configuration
        const argHandlers = new Map([
            ['--ollama', (i) => {
                config.lm.enabled = true;
                if (args[i + 1] && !args[i + 1].startsWith('--')) {
                    config.lm.modelName = args[++i];
                }
                return i;
            }],
            ['--provider', (i) => {
                config.lm.provider = args[++i];
                config.lm.enabled = true;
                return i;
            }],
            ['--model', (i) => {
                config.lm.modelName = args[++i];
                config.lm.enabled = true;
                return i;
            }],
            ['--modelName', (i) => {
                config.lm.modelName = args[++i];
                config.lm.enabled = true;
                return i;
            }],
            ['--base-url', (i) => {
                config.lm.baseUrl = args[++i];
                return i;
            }],
            ['--temperature', (i) => {
                config.lm.temperature = parseFloat(args[++i]);
                return i;
            }],
            ['--api-key', (i) => {
                config.lm.apiKey = args[++i];
                return i;
            }],
            ['--ws-port', (i) => {
                config.webSocket.port = parseInt(args[++i]);
                return i;
            }],
            ['--host', (i) => {
                config.webSocket.host = args[++i];
                return i;
            }],
            ['--port', (i) => {
                config.ui.port = parseInt(args[++i]);
                return i;
            }],
            ['--graph-ui', (i) => {
                config.ui.layout = 'graph';
                return i;
            }],
            ['--layout', (i) => {
                config.ui.layout = args[++i];
                return i;
            }],
            ['--prod', (i) => {
                config.ui.dev = false;
                return i;
            }],
            ['--dev', (i) => {
                config.ui.dev = true;
                return i;
            }],
            ['--demo', (i) => {
                config.demo = true;
                return i;
            }],
            ['--embedding', (i) => {
                config.subsystems = config.subsystems || {};
                config.subsystems.embeddingLayer = config.subsystems.embeddingLayer || {};
                config.subsystems.embeddingLayer.enabled = true;
                return i;
            }],
            ['--embedding-model', (i) => {
                config.subsystems = config.subsystems || {};
                config.subsystems.embeddingLayer = config.subsystems.embeddingLayer || {};
                config.subsystems.embeddingLayer.enabled = true;
                config.subsystems.embeddingLayer.model = args[++i];
                return i;
            }]
        ]);

        // Process arguments using index tracking
        let i = 0;
        while (i < args.length) {
            const arg = args[i];
            const handler = argHandlers.get(arg);

            if (handler) {
                i = handler(i);
            }
            i++;
        }

        return config;
    }
}

export class ConfigValidator {
    /**
     * Validates a configuration object against the schema
     * @param {Object} config - Configuration object to validate
     * @returns {Array} - Array of validation errors
     */
    static validate(config) {
        try {
            validateConfigWithDefaults(config);
            return [];
        } catch (error) {
            return [error.message];
        }
    }

    /**
     * Merges user configuration with default configuration
     * @param {Object} userConfig - User-provided configuration
     * @returns {Object} - Merged configuration
     */
    static mergeWithDefaults(userConfig) {
        try {
            return validateConfigWithDefaults(userConfig || {});
        } catch (error) {
            // If validation fails, return defaults merged with user config
            return { ...DEFAULT_CONFIG, ...userConfig };
        }
    }

    /**
     * Deep merges two configuration objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} - Merged object
     */
    static deepMerge(target, source) {
        const isObject = (item) => {
            return (item && typeof item === 'object' && !Array.isArray(item));
        };

        if (!source) return target;
        const output = { ...target };

        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target))
                        Object.assign(output, { [key]: source[key] });
                    else
                        output[key] = ConfigValidator.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }
}

/**
 * Base class for components with standardized lifecycle management
 */
export class Component {
    /**
     * Constructor for base component
     * @param {Object} config - Component configuration
     */
    constructor(config = {}) {
        this.config = ConfigValidator.mergeWithDefaults(config);
        this.initialized = false;
        this.started = false;
        this.stopped = false;
    }

    /**
     * Initialize the component
     * @returns {Promise<boolean>} - True if initialization was successful
     */
    async initialize() {
        if (this.initialized) {
            Logger.warn(`${this.constructor.name} is already initialized`);
            return true;
        }

        try {
            const errors = ConfigValidator.validate(this.config);
            if (errors.length > 0) {
                throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
            }

            await this._initialize();
            this.initialized = true;
            return true;
        } catch (error) {
            Logger.error(`Failed to initialize ${this.constructor.name}:`, error);
            return false;
        }
    }

    /**
     * Start the component
     * @returns {Promise<boolean>} - True if start was successful
     */
    async start() {
        if (!this.initialized) {
            throw new Error(`${this.constructor.name} must be initialized before starting`);
        }

        if (this.started) {
            Logger.warn(`${this.constructor.name} is already started`);
            return true;
        }

        try {
            await this._start();
            this.started = true;
            return true;
        } catch (error) {
            Logger.error(`Failed to start ${this.constructor.name}:`, error);
            return false;
        }
    }

    /**
     * Stop the component
     * @returns {Promise<boolean>} - True if stop was successful
     */
    async stop() {
        if (!this.started) {
            Logger.warn(`${this.constructor.name} is not running`);
            return true;
        }

        try {
            await this._stop();
            this.stopped = true;
            this.started = false;
            return true;
        } catch (error) {
            Logger.error(`Failed to stop ${this.constructor.name}:`, error);
            return false;
        }
    }

    /**
     * Destroy the component and clean up resources
     * @returns {Promise<void>}
     */
    async destroy() {
        if (this.started) {
            await this.stop();
        }

        try {
            await this._destroy();
        } catch (error) {
            Logger.error(`Error during destroy of ${this.constructor.name}:`, error);
        }
    }

    /**
     * Internal initialization method - to be implemented by subclasses
     * @protected
     */
    async _initialize() {
        // Default implementation - subclasses should override
    }

    /**
     * Internal start method - to be implemented by subclasses
     * @protected
     */
    async _start() {
        // Default implementation - subclasses should override
    }

    /**
     * Internal stop method - to be implemented by subclasses
     * @protected
     */
    async _stop() {
        // Default implementation - subclasses should override
    }

    /**
     * Internal destroy method - to be implemented by subclasses
     * @protected
     */
    async _destroy() {
        // Default implementation - subclasses should override
    }

    /**
     * Get component status
     * @returns {Object} - Component status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            started: this.started,
            stopped: this.stopped,
            config: this.config,
        };
    }

    /**
     * Update configuration at runtime
     * @param {Object} newConfig - New configuration values
     * @returns {boolean} - True if update was successful
     */
    updateConfig(newConfig) {
        try {
            const errors = ConfigValidator.validate(newConfig);
            if (errors.length > 0) {
                throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
            }

            this.config = ConfigValidator.deepMerge(this.config, newConfig);
            return true;
        } catch (error) {
            Logger.error(`Failed to update config for ${this.constructor.name}:`, error);
            return false;
        }
    }
}