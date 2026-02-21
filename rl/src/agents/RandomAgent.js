
import { RLAgent } from '../core/RLAgent.js';

export class RandomAgent extends RLAgent {
    constructor(env) {
        super(env);
    }

    act(observation) {
        const actionSpace = this.env.actionSpace;
        if (actionSpace.type === 'Discrete') {
            return Math.floor(Math.random() * actionSpace.n);
        } else if (actionSpace.type === 'Box') {
            // Uniform random between low and high
            const action = [];
            for (let i = 0; i < actionSpace.shape[0]; i++) {
                const low = actionSpace.low[i];
                const high = actionSpace.high[i];
                action.push(Math.random() * (high - low) + low);
            }
            return action;
        }
        throw new Error("Unknown action space type");
    }

    learn(observation, action, reward, nextObservation, done) {
        // Random agent doesn't learn
    }
}
