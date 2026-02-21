
import { SeNARSBridge } from '../reasoning/SeNARSBridge.js';

export class ModelBasedStrategy {
    /**
     * @param {SeNARSBridge} bridge
     */
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = config;
        this.planningHorizon = config.planningHorizon || 3;
    }

    /**
     * Plan and execute using the world model.
     * @param {*} obs
     * @param {*} goal
     * @returns {*} action
     */
    async act(obs, goal) {
        // 1. Observe
        // In SeNARS, we input the observation as a fact
        const obsTerm = this._obsToNars(obs);
        await this.bridge.input(`<(*, ${obsTerm}) --> obs>. :|:`);

        // 2. Goal
        const goalTerm = goal ? this._goalToNars(goal) : 'goal';
        const goalStmt = `<(*, ${goalTerm}) --> achieved>!`;

        // 3. Plan / Ask
        // Ask: "What action leads to goal?"
        // Or "<?op =/> goal>?"
        // SeNARS usually works by "achieve" command.

        const result = await this.bridge.achieve(goalStmt, { cycles: 50 });

        if (result.achieved && result.term) {
             // The result term might be the operation itself
             // Or we need to ask "what operation was selected?"
             // In NARS, operations are executed as side effects of achieving goals.
             // If we want to intercept, we need to check if an operation was executed.

             // For now, return a placeholder action based on result term
             return result.term;
        }

        // Fallback: Random or explore
        return null;
    }

    _obsToNars(obs) {
        if (Array.isArray(obs)) return `(${obs.join(',')})`;
        return String(obs);
    }

    _goalToNars(goal) {
        if (typeof goal === 'string') return goal;
        return 'goal';
    }
}
