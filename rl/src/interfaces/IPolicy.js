/**
 * Policy Interface - Contract for all RL policies
 *
 * Policies define how actions are selected given observations.
 * All policy implementations must implement this interface.
 *
 * @interface IPolicy
 * @extends {import('../composable/Component.js').Component}
 */
export const IPolicy = {
    /**
     * Select action given state/observation
     * @function IPolicy#selectAction
     * @param {*} state - Current state/observation
     * @param {Object} [options] - Additional options
     * @param {boolean} [options.exploration] - Whether to use exploration
     * @param {number} [options.temperature] - Sampling temperature
     * @returns {Promise<*>} Selected action
     * @async
     */
    selectAction: null,

    /**
     * Update policy based on experience
     * @function IPolicy#update
     * @param {Object} experience - Experience tuple
     * @param {*} experience.state - State
     * @param {*} experience.action - Action
     * @param {number} experience.reward - Reward
     * @param {*} experience.nextState - Next state
     * @param {boolean} experience.done - Whether episode terminated
     * @param {Object} [options] - Additional learning options
     * @returns {Promise<{updated: boolean, loss?: number, info?: Object}>} Update result
     * @async
     */
    update: null,

    /**
     * Get policy parameters/state
     * @function IPolicy#getParameters
     * @returns {Object} Policy parameters
     */
    getParameters: null,

    /**
     * Set policy parameters/state
     * @function IPolicy#setParameters
     * @param {Object} params - New parameters
     */
    setParameters: null,

    /**
     * Get policy statistics
     * @function IPolicy#getStats
     * @returns {Object} Policy statistics
     */
    getStats: null,

    /**
     * Save policy to disk
     * @function IPolicy#save
     * @param {string} [path] - Save path
     * @returns {Promise<{saved: boolean, path: string}>} Save result
     * @async
     */
    save: null,

    /**
     * Load policy from disk
     * @function IPolicy#load
     * @param {string} [path] - Load path
     * @returns {Promise<{loaded: boolean, path: string}>} Load result
     * @async
     */
    load: null,

    /**
     * Reset policy state
     * @function IPolicy#reset
     */
    reset: null
};

/**
 * Type definition for Policy implementations
 * @typedef {Object} IPolicy
 * @property {Function} selectAction - Select action
 * @property {Function} update - Update from experience
 * @property {Function} getParameters - Get parameters
 * @property {Function} setParameters - Set parameters
 * @property {Function} getStats - Get statistics
 * @property {Function} save - Save to disk
 * @property {Function} load - Load from disk
 * @property {Function} reset - Reset state
 */
