
/**
 * Base class for Neuro-Symbolic Architectures.
 * Defines the contract for different reasoning and learning strategies.
 */
export class Architecture {
    constructor(agent, config = {}) {
        this.agent = agent;
        this.config = config;
        this.initialized = false;
    }

    /**
     * Initialize the architecture (load models, start reasoning engines).
     */
    async initialize() {
        this.initialized = true;
    }

    /**
     * Decide on an action given an observation and goal.
     * @param {Array|Object} observation
     * @param {any} goal
     * @returns {Promise<any>} Action
     */
    async act(observation, goal) {
        throw new Error("act() not implemented");
    }

    /**
     * Learn from experience.
     * @param {Array|Object} observation
     * @param {any} action
     * @param {number} reward
     * @param {Array|Object} nextObservation
     * @param {boolean} done
     */
    async learn(observation, action, reward, nextObservation, done) {
        // Optional
    }

    /**
     * Close/Dispose resources.
     */
    async close() {
        this.initialized = false;
    }
}
