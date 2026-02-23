export class RLAgent {
    constructor(env) {
        if (this.constructor === RLAgent) {
            throw new Error('Cannot instantiate abstract class RLAgent');
        }
        this.env = env;
        this.training = true;
    }

    /**
     * @param {*} observation
     * @returns {*} action
     */
    act(observation) {
        throw new Error('Method act(observation) must be implemented.');
    }

    /**
     * @param {*} observation
     * @param {*} action
     * @param {*} reward
     * @param {*} nextObservation
     * @param {*} done
     */
    learn(observation, action, reward, nextObservation, done) {}

    /**
     * @param {string} path
     */
    save(path) {}

    /**
     * @param {string} path
     */
    load(path) {}
}
