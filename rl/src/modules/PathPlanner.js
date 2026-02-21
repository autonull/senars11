
import { SeNARSBridge } from '../bridges/SeNARSBridge.js';

export class PathPlanner {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = config;
    }

    /**
     * Plan a sequence of actions to achieve a goal.
     * @param {*} startState Symbolic state
     * @param {*} goal Symbolic goal
     * @returns {Array} Sequence of actions
     */
    async plan(startState, goal) {
        // Use SeNARS to find a path
        // Query: <(startState) --> (path-to, goal)>?

        // Or iterative ask: "What to do next?"
        const result = await this.bridge.ask(`<( ${startState} ) --> (path-to, ${goal})>?`);

        if (result && result.answer) {
             // Parse result.term to get sequence
             // Assume result is like (op1, op2, ...)
             return result.term;
        }

        return null;
    }
}
