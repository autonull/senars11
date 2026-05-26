/**
 * Environment Interface - Contract for all RL environments
 *
 * All environment implementations must implement this interface.
 * Use JSDoc @implements tag to indicate implementation.
 *
 * @interface IEnvironment
 * @extends {import('../composable/Component.js').Component}
 */
export const IEnvironment = {
    /**
     * Reset environment to initial state
     * @function IEnvironment#reset
     * @param {Object} [options] - Reset options
     * @returns {{observation: *, info: Object}} Initial observation and info
     */
    reset: null,

    /**
     * Execute action in environment
     * @function IEnvironment#step
     * @param {*} action - Action to execute
     * @returns {{
     *   observation: *,
     *   reward: number,
     *   terminated: boolean,
     *   truncated: boolean,
     *   info: Object
     * }} Step result
     */
    step: null,

    /**
     * Render environment
     * @function IEnvironment#render
     * @param {string} [mode] - Render mode
     * @returns {*} Render output
     */
    render: null,

    /**
     * Close environment and release resources
     * @function IEnvironment#close
     */
    close: null,

    /**
     * Seed environment for reproducibility
     * @function IEnvironment#seed
     * @param {number} [seed] - Random seed
     * @returns {{seeded: boolean, seed: number}} Seed result
     */
    seed: null,

    /**
     * Get observation space specification
     * @function IEnvironment#observationSpace
     * @type {{type: string, shape?: number[], n?: number, low?: number|number[], high?: number|number[]}}
     * @readonly
     */
    observationSpace: null,

    /**
     * Get action space specification
     * @function IEnvironment#actionSpace
     * @type {{type: string, shape?: number[], n?: number, low?: number|number[], high?: number|number[]}}
     * @readonly
     */
    actionSpace: null,

    /**
     * Check if action is valid
     * @function IEnvironment#isValidAction
     * @param {*} action - Action to check
     * @returns {boolean} Whether action is valid
     */
    isValidAction: null,

    /**
     * Sample random action
     * @function IEnvironment#sampleAction
     * @returns {*} Random action
     */
    sampleAction: null,

    /**
     * Sample random observation
     * @function IEnvironment#sampleObservation
     * @returns {*} Random observation
     */
    sampleObservation: null,

    /**
     * Get environment statistics
     * @function IEnvironment#getStats
     * @returns {{
     *   currentSteps: number,
     *   totalSteps: number,
     *   totalEpisodes: number,
     *   metrics: Object
     * }} Environment statistics
     */
    getStats: null
};

/**
 * Space type definitions
 * @typedef {Object} DiscreteSpace
 * @property {'Discrete'} type
 * @property {number} n - Number of discrete values
 *
 * @typedef {Object} BoxSpace
 * @property {'Box'} type
 * @property {number[]} shape - Shape of the space
 * @property {number|number[]} low - Lower bound(s)
 * @property {number|number[]} high - Upper bound(s)
 *
 * @typedef {DiscreteSpace|BoxSpace} Space
 */

/**
 * Type definition for Environment implementations
 * @typedef {Object} IEnvironment
 * @property {Function} reset - Reset environment
 * @property {Function} step - Execute action
 * @property {Function} render - Render environment
 * @property {Function} close - Close environment
 * @property {Function} seed - Seed for reproducibility
 * @property {Space} observationSpace - Observation space
 * @property {Space} actionSpace - Action space
 * @property {Function} isValidAction - Check action validity
 * @property {Function} sampleAction - Sample random action
 * @property {Function} sampleObservation - Sample random observation
 * @property {Function} getStats - Get statistics
 */
