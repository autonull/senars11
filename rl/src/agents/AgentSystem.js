import {AgentFactoryUtils} from './QNetwork.js';
import {NeuralAgent} from './NeuralAgent.js';
import {DQNAgent} from './DQNAgent.js';
import {PPOAgent} from './PPOAgent.js';
import {PolicyGradientAgent} from './PolicyGradientAgent.js';
import {RandomAgent} from './RandomAgent.js';

export {NeuralAgent};

export class AgentBuilder {
    constructor(env) {
        this.env = env;
        this.config = {};
    }

    static create(env) {
        return new AgentBuilder(env);
    }

    dqn(config = {}) {
        return new DQNAgent(this.env, config);
    }

    ppo(config = {}) {
        return new PPOAgent(this.env, config);
    }

    policyGradient(config = {}) {
        return new PolicyGradientAgent(this.env, config);
    }

    random(config = {}) {
        return new RandomAgent(this.env, config);
    }

    withConfig(config) {
        this.config = {...this.config, ...config};
        return this;
    }
}

export {AgentFactoryUtils};
export {AgentFactoryUtils as AgentUtils};

export {DQNAgent} from './DQNAgent.js';
export {PPOAgent} from './PPOAgent.js';
export {PolicyGradientAgent} from './PolicyGradientAgent.js';
export {RandomAgent} from './RandomAgent.js';
export {MeTTaAgent} from './MeTTaAgent.js';
export {ProgrammaticAgent} from './ProgrammaticAgent.js';
export {NeuroSymbolicAgent} from './NeuroSymbolicAgent.js';
export {QNetwork} from './QNetwork.js';
