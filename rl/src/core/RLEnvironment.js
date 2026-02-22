export class RLEnvironment {
    constructor() {
        if (this.constructor === RLEnvironment) {
            throw new Error('Cannot instantiate abstract class RLEnvironment');
        }
    }

    /**
     * @returns {Object} { observation, info }
     */
    reset() {
        throw new Error('Method reset() must be implemented.');
    }

    /**
     * @param {*} action
     * @returns {Object} { observation, reward, terminated, truncated, info }
     */
    step(action) {
        throw new Error('Method step(action) must be implemented.');
    }

    render() {}

    close() {}

    /**
     * @returns {Object} e.g., { type: 'Discrete', n: 5 } or { type: 'Box', shape: [4], low: [...], high: [...] }
     */
    get observationSpace() {
        throw new Error('Getter observationSpace must be implemented.');
    }

    /**
     * @returns {Object} e.g., { type: 'Discrete', n: 3 }
     */
    get actionSpace() {
        throw new Error('Getter actionSpace must be implemented.');
    }
}
