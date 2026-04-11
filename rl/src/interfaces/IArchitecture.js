/**
 * Architecture Interface - Contract for all RL architectures
 *
 * All architecture implementations must implement this interface.
 * Architectures define how agents process observations and select actions.
 *
 * @interface IArchitecture
 * @extends {import('../composable/Component.js').Component}
 */
export const IArchitecture = {
    /**
     * Select action given observation and optional goal
     * @function IArchitecture#act
     * @param {*} observation - Current observation
     * @param {*} [goal] - Optional goal specification
     * @returns {Promise<*>} Selected action
     * @async
     */
    act: null,

    /**
     * Learn from transition experience
     * @function IArchitecture#learn
     * @param {*} observation - Current observation
     * @param {*} action - Taken action
     * @param {number} reward - Received reward
     * @param {*} nextObservation - Next observation
     * @param {boolean} done - Whether episode terminated
     * @returns {Promise<{learned: boolean, info?: Object}>} Learning result
     * @async
     */
    learn: null,

    /**
     * Close architecture and release resources
     * @function IArchitecture#close
     * @returns {Promise<void>}
     * @async
     */
    close: null,

    /**
     * Get architecture statistics
     * @function IArchitecture#getStats
     * @returns {{
     *   initialized: boolean,
     *   metrics: Object
     * }} Architecture statistics
     */
    getStats: null
};

/**
 * Type definition for Architecture implementations
 * @typedef {Object} IArchitecture
 * @property {Function} act - Select action
 * @property {Function} learn - Learn from experience
 * @property {Function} close - Close and release resources
 * @property {Function} getStats - Get statistics
 */
