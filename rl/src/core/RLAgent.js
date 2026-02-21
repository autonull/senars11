
/**
 * Abstract base class for RL Agents.
 */
export class RLAgent {
    constructor(env) {
        if (this.constructor === RLAgent) {
            throw new Error("Cannot instantiate abstract class RLAgent");
        }
        this.env = env;
        this.training = true;
    }

    /**
     * Choose an action based on the observation.
     * @param {*} observation
     * @returns {*} action
     */
    act(observation) {
        throw new Error("Method 'act(observation)' must be implemented.");
    }

    /**
     * Update the agent's policy based on the transition.
     * @param {*} observation
     * @param {*} action
     * @param {*} reward
     * @param {*} nextObservation
     * @param {*} done
     */
    learn(observation, action, reward, nextObservation, done) {
        // Optional: Agents that don't learn online can leave this empty
    }

    /**
     * Save the agent's state/model.
     * @param {string} path
     */
    save(path) {
        // Optional
    }

    /**
     * Load the agent's state/model.
     * @param {string} path
     */
    load(path) {
        // Optional
    }
}
