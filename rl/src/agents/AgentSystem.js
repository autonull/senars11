import { Agent } from '../core/RLCore.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { AgentFactoryUtils } from './QNetwork.js';
import { NeuralAgent } from './NeuralAgent.js';

export { NeuralAgent };

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

export { AgentFactoryUtils };
export { AgentFactoryUtils as AgentUtils };

export { DQNAgent } from './DQNAgent.js';
export { PPOAgent } from './PPOAgent.js';
export { PolicyGradientAgent } from './PolicyGradientAgent.js';
export { RandomAgent } from './RandomAgent.js';
export { MeTTaAgent } from './MeTTaAgent.js';
export { ProgrammaticAgent } from './ProgrammaticAgent.js';
export { NeuroSymbolicAgent } from './NeuroSymbolicAgent.js';
export { QNetwork } from './QNetwork.js';
