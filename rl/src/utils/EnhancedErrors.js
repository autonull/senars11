/**
 * Enhanced Error Classes with Helpful Messages
 * Provides actionable error messages with suggestions and documentation links
 */

/**
 * Base class for enhanced errors with suggestions
 */
export class EnhancedError extends Error {
    constructor(message, suggestions = [], docsLink = null) {
        super(message);
        this.name = this.constructor.name;
        this.suggestions = suggestions;
        this.docsLink = docsLink;
        this.timestamp = Date.now();
    }

    formatMessage() {
        let msg = this.message;

        if (this.suggestions.length > 0) {
            msg += '\n\n💡 Suggestions:\n' + this.suggestions.map(s => `   - ${s}`).join('\n');
        }

        if (this.docsLink) {
            msg += `\n\n📖 Documentation: ${this.docsLink}`;
        }

        return msg;
    }

    toString() {
        return `${this.name}: ${this.formatMessage()}`;
    }
}

/**
 * Error for component lifecycle issues
 */
export class LifecycleError extends EnhancedError {
    constructor(issue, context = {}) {
        const { component, method, state } = context;

        let message = `Component lifecycle error: ${issue}`;
        const suggestions = [];

        if (method === 'act' && state === 'not_initialized') {
            message = `Component '${component}' not initialized before calling '${method}()'`;
            suggestions.push('Call await component.initialize() before using the component');
            suggestions.push('Example: const agent = new DQNAgent(env); await agent.initialize();');
        } else if (method === 'shutdown' && state === 'already_shutdown') {
            message = `Component '${component}' already shutdown`;
            suggestions.push('Check component.initialized before calling shutdown()');
        }

        super(message, suggestions, 'https://senars.ai/rl/components/lifecycle');
    }
}

/**
 * Error for environment-related issues
 */
export class EnvironmentError extends EnhancedError {
    constructor(issue, context = {}) {
        const { env, action, observation } = context;

        let message = `Environment error: ${issue}`;
        const suggestions = [];

        if (issue === 'not_reset') {
            message = `Environment '${env}' not reset before step()`;
            suggestions.push('Call env.reset() before starting an episode');
            suggestions.push('Example: const { observation } = env.reset();');
        } else if (issue === 'invalid_action') {
            message = `Invalid action ${action} for environment '${env}'`;
            suggestions.push('Check env.actionSpace for valid action range');
            suggestions.push('Use env.sampleAction() to get a valid random action');
        } else if (issue === 'episode_done') {
            message = `Cannot step in environment '${env}' after episode end`;
            suggestions.push('Call env.reset() to start a new episode');
        }

        super(message, suggestions, 'https://senars.ai/rl/environments/usage');
    }
}

/**
 * Error for agent-related issues
 */
export class AgentError extends EnhancedError {
    constructor(issue, context = {}) {
        const { agent, observation, action } = context;

        let message = `Agent error: ${issue}`;
        const suggestions = [];

        if (issue === 'not_trained') {
            message = `Agent '${agent}' acting without training`;
            suggestions.push('Train the agent first: await agent.train(env, { episodes: 100 })');
            suggestions.push('Or load a pre-trained model: await agent.load("./checkpoint.json")');
        } else if (issue === 'observation_shape_mismatch') {
            message = `Observation shape mismatch for agent '${agent}'`;
            suggestions.push('Check that observation dimensions match agent\'s expected input');
            suggestions.push(`Expected shape: ${observation?.expected ?? 'unknown'}`);
        }

        super(message, suggestions, 'https://senars.ai/rl/agents/training');
    }
}

/**
 * Error for configuration issues
 */
export class ConfigError extends EnhancedError {
    constructor(issue, context = {}) {
        const { key, value, expected } = context;

        let message = `Configuration error: ${issue}`;
        const suggestions = [];

        if (issue === 'missing_required') {
            message = `Missing required configuration: '${key}'`;
            suggestions.push(`Add '${key}' to the configuration object`);
            suggestions.push(`Example: { ${key}: ${expected ?? 'value'} }`);
        } else if (issue === 'invalid_type') {
            message = `Invalid type for '${key}': expected ${expected}, got ${typeof value}`;
            suggestions.push(`Change '${key}' to type ${expected}`);
        } else if (issue === 'invalid_range') {
            message = `Value ${value} for '${key}' is out of range`;
            suggestions.push(`Use a value in the range: ${expected}`);
        }

        super(message, suggestions, 'https://senars.ai/rl/configuration');
    }
}

/**
 * Error for tensor/shape issues
 */
export class TensorError extends EnhancedError {
    constructor(issue, context = {}) {
        const { expected, actual, operation } = context;

        let message = `Tensor error: ${issue}`;
        const suggestions = [];

        if (issue === 'shape_mismatch') {
            message = `Shape mismatch in ${operation}: expected [${expected}], got [${actual}]`;
            suggestions.push('Check tensor dimensions before the operation');
            suggestions.push('Use tensor.reshape() if dimensions are compatible');
        } else if (issue === 'dtype_mismatch') {
            message = `Data type mismatch in ${operation}: expected ${expected}, got ${actual}`;
            suggestions.push(`Convert tensor to ${expected} using tensor.cast('${expected}')`);
        }

        super(message, suggestions, 'https://senars.ai/tensor/operations');
    }
}

/**
 * Error for training-related issues
 */
export class TrainingError extends EnhancedError {
    constructor(issue, context = {}) {
        const { episode, metric, value } = context;

        let message = `Training error: ${issue}`;
        const suggestions = [];

        if (issue === 'nan_loss') {
            message = `NaN loss detected at episode ${episode}`;
            suggestions.push('Reduce learning rate (try 0.0001 or lower)');
            suggestions.push('Check for reward scaling issues (normalize rewards)');
            suggestions.push('Add gradient clipping: { maxGradientNorm: 1.0 }');
        } else if (issue === 'divergence') {
            message = `Training divergence detected: ${metric} = ${value}`;
            suggestions.push('Reduce learning rate');
            suggestions.push('Increase batch size for more stable gradients');
            suggestions.push('Check for reward hacking or environment bugs');
        }

        super(message, suggestions, 'https://senars.ai/rl/training/debugging');
    }
}

/**
 * Error for neuro-symbolic integration issues
 */
export class NeuroSymbolicError extends EnhancedError {
    constructor(issue, context = {}) {
        const { bridge, symbolic, neural } = context;

        let message = `Neuro-symbolic error: ${issue}`;
        const suggestions = [];

        if (issue === 'grounding_failed') {
            message = `Failed to ground symbolic term to tensor`;
            suggestions.push('Check that symbolic term is well-formed');
            suggestions.push('Ensure tensor shape matches grounding specification');
        } else if (issue === 'lift_failed') {
            message = `Failed to lift tensor to symbolic representation`;
            suggestions.push('Check tensor dimensions match expected symbolic structure');
            suggestions.push('Verify bridge configuration for symbolic mapping');
        }

        super(message, suggestions, 'https://senars.ai/rl/neuro-symbolic/bridge');
    }
}

/**
 * Error factory for common scenarios
 */
export const Errors = {
    /**
     * Create lifecycle error
     */
    lifecycle(issue, context) {
        return new LifecycleError(issue, context);
    },

    /**
     * Create environment error
     */
    environment(issue, context) {
        return new EnvironmentError(issue, context);
    },

    /**
     * Create agent error
     */
    agent(issue, context) {
        return new AgentError(issue, context);
    },

    /**
     * Create configuration error
     */
    config(issue, context) {
        return new ConfigError(issue, context);
    },

    /**
     * Create tensor error
     */
    tensor(issue, context) {
        return new TensorError(issue, context);
    },

    /**
     * Create training error
     */
    training(issue, context) {
        return new TrainingError(issue, context);
    },

    /**
     * Create neuro-symbolic error
     */
    neuroSymbolic(issue, context) {
        return new NeuroSymbolicError(issue, context);
    }
};

/**
 * Validate configuration with enhanced errors
 */
export function validateConfig(config, schema, context = '') {
    for (const [key, spec] of Object.entries(schema)) {
        const value = config[key];
        const fullKey = context ? `${context}.${key}` : key;

        if (spec.required && value === undefined) {
            throw Errors.config('missing_required', { key: fullKey, expected: spec.default });
        }

        if (value !== undefined && spec.type && typeof value !== spec.type) {
            throw Errors.config('invalid_type', { key: fullKey, value, expected: spec.type });
        }

        if (value !== undefined && spec.range) {
            const [min, max] = spec.range;
            if (typeof value === 'number' && (value < min || value > max)) {
                throw Errors.config('invalid_range', { key: fullKey, value, expected: `[${min}, ${max}]` });
            }
        }
    }
}
