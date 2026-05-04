/**
 * Agent Interface - Contract for all RL agents
 *
 * All agent implementations must implement this interface.
 * Use JSDoc @implements tag to indicate implementation.
 *
 * @interface IAgent
 * @extends {import('../composable/Component.js').Component}
 */
export const IAgent = {
    /**
     * Select action given observation
     * @function IAgent#act
     * @param {*} observation - Current observation from environment
     * @param {Object} [options] - Additional options (exploration, goal, etc.)
     * @returns {*} Selected action
     * @async
     */
    act: null,

    /**
     * Learn from transition experience
     * @function IAgent#learn
     * @param {*} observation - Current observation
     * @param {*} action - Taken action
     * @param {number} reward - Received reward
     * @param {*} nextObservation - Next observation
     * @param {boolean} done - Whether episode terminated
     * @param {Object} [options] - Additional learning options
     * @returns {Promise<{learned: boolean, info?: Object}>} Learning result
     * @async
     */
    learn: null,

    /**
     * Save agent to disk
     * @function IAgent#save
     * @param {string} [path] - Save path (uses default if not provided)
     * @returns {Promise<{saved: boolean, path: string}>} Save result
     * @async
     */
    save: null,

    /**
     * Load agent from disk
     * @function IAgent#load
     * @param {string} [path] - Load path (uses default if not provided)
     * @returns {Promise<{loaded: boolean, path: string}>} Load result
     * @async
     */
    load: null,

    /**
     * Set training mode
     * @function IAgent#setTraining
     * @param {boolean} training - Training mode (true for training, false for evaluation)
     */
    setTraining: null,

    /**
     * Get agent statistics
     * @function IAgent#getStats
     * @returns {Object} Agent statistics including metrics
     */
    getStats: null,

    /**
     * Reset agent state for new episode
     * @function IAgent#reset
     */
    reset: null
};

/**
 * Type definition for Agent implementations
 * @typedef {Object} IAgent
 * @property {Function} act - Select action
 * @property {Function} learn - Learn from experience
 * @property {Function} save - Save to disk
 * @property {Function} load - Load from disk
 * @property {Function} setTraining - Set training mode
 * @property {Function} getStats - Get statistics
 * @property {Function} reset - Reset state
 */
