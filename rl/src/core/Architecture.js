export class Architecture {
    constructor(agent, config = {}) {
        this.agent = agent;
        this.config = config;
        this.initialized = false;
    }

    async initialize() {
        this.initialized = true;
    }

    /**
     * @param {Array|Object} observation
     * @param {any} goal
     * @returns {Promise<any>} Action
     */
    async act(observation, goal) {
        throw new Error('act() not implemented');
    }

    /**
     * @param {Array|Object} observation
     * @param {any} action
     * @param {number} reward
     * @param {Array|Object} nextObservation
     * @param {boolean} done
     */
    async learn(observation, action, reward, nextObservation, done) {}

    async close() {
        this.initialized = false;
    }
}
