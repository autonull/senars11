
/**
 * Abstract base class for RL Environments.
 * Follows the Gym/Gymnasium API standard.
 */
export class RLEnvironment {
    constructor() {
        if (this.constructor === RLEnvironment) {
            throw new Error("Cannot instantiate abstract class RLEnvironment");
        }
    }

    /**
     * Resets the environment to an initial state and returns the initial observation.
     * @returns {Object} { observation, info }
     */
    reset() {
        throw new Error("Method 'reset()' must be implemented.");
    }

    /**
     * Run one timestep of the environment's dynamics.
     * @param {*} action - The action to be executed.
     * @returns {Object} { observation, reward, terminated, truncated, info }
     */
    step(action) {
        throw new Error("Method 'step(action)' must be implemented.");
    }

    /**
     * Render the environment.
     */
    render() {
        // Optional implementation
    }

    /**
     * Close the environment and release resources.
     */
    close() {
        // Optional implementation
    }

    /**
     * Returns the observation space specification.
     * @returns {Object} e.g., { type: 'Discrete', n: 5 } or { type: 'Box', shape: [4], low: [...], high: [...] }
     */
    get observationSpace() {
        throw new Error("Getter 'observationSpace' must be implemented.");
    }

    /**
     * Returns the action space specification.
     * @returns {Object} e.g., { type: 'Discrete', n: 3 }
     */
    get actionSpace() {
        throw new Error("Getter 'actionSpace' must be implemented.");
    }
}
