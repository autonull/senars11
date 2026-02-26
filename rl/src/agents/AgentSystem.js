/**
 * Agent System - Base Classes and Exports
 * 
 * This file contains base agent classes and re-exports specialized implementations.
 */
import { RLAgent } from '../core/RLAgent.js';
import { deepMergeConfig } from '../utils/ConfigHelper.js';
import { AgentFactoryUtils } from './QNetwork.js';
import { NeuralAgent } from './NeuralAgent.js';

// Re-export NeuralAgent base class
export { NeuralAgent };

/**
 * AgentBuilder - Factory for creating agents
 */
export class AgentBuilder {
    constructor(env) {
        this.env = env;
        this.config = {};
    }

    static create(env) {
        return new AgentBuilder(env);
    }

    dqn(config = {}) {
        const { DQNAgent } = require('./DQNAgent.js');
        return new DQNAgent(this.env, config);
    }

    ppo(config = {}) {
        const { PPOAgent } = require('./PPOAgent.js');
        return new PPOAgent(this.env, config);
    }

    policyGradient(config = {}) {
        const { PolicyGradientAgent } = require('./PolicyGradientAgent.js');
        return new PolicyGradientAgent(this.env, config);
    }

    random(config = {}) {
        const { RandomAgent } = require('./RandomAgent.js');
        return new RandomAgent(this.env, config);
    }

    withConfig(config) {
        this.config = { ...this.config, ...config };
        return this;
    }
}

// Re-export utilities
export { AgentFactoryUtils };
export { AgentFactoryUtils as AgentUtils };

// Re-export specialized agents
export { DQNAgent } from './DQNAgent.js';
export { PPOAgent } from './PPOAgent.js';
export { PolicyGradientAgent } from './PolicyGradientAgent.js';
export { RandomAgent } from './RandomAgent.js';

// Re-export MeTTa-based agents
export { MeTTaAgent } from './MeTTaAgent.js';
export { ProgrammaticAgent } from './ProgrammaticAgent.js';
export { NeuroSymbolicAgent } from './NeuroSymbolicAgent.js';

// Re-export QNetwork
export { QNetwork } from './QNetwork.js';
