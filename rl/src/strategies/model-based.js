
export class ModelBasedStrategy {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = config;
        this.planningHorizon = config.planningHorizon || 3;
    }

    async act(obs, goal) {
        if (!this.bridge) return null;

        const obsTerm = this._term(obs);
        await this.bridge.input(`<(*, ${obsTerm}) --> obs>.`);

        // If a goal is provided, use it directly as the Narsese goal statement
        // The goal should be in a format that implies "make this observed"
        // Standard NARS: goal!
        // If the goal is a value/vector, we wrap it: <(*, G) --> obs>!
        const goalTerm = `<(*, ${this._term(goal || 'goal')}) --> obs>`;
        const goalStmt = `${goalTerm}!`;

        const result = await this.bridge.achieve(goalStmt, { cycles: 50 });

        if (result?.executedOperations && result.executedOperations.length > 0) {
            // Return the first executed operation
            return result.executedOperations[0];
        }

        // Fallback: if "achieved" is true but no op, maybe the state already satisfies it
        // or the result term is the achievement itself.
        // But for RL act(), we need an action.
        return null;
    }

    _term(val) {
        return Array.isArray(val) ? `(${val.join(',')})` : String(val);
    }
}
