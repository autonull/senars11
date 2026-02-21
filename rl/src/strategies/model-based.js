
export class ModelBasedStrategy {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = config;
        this.planningHorizon = config.planningHorizon || 3;
    }

    async act(obs, goal) {
        if (!this.bridge) return null;

        const obsTerm = this._term(obs);
        await this.bridge.input(`<(*, ${obsTerm}) --> obs>. :|:`);

        const goalStmt = `<(*, ${this._term(goal || 'goal')}) --> achieved>!`;
        const result = await this.bridge.achieve(goalStmt, { cycles: 50 });

        return result?.achieved && result.term ? result.term : null;
    }

    _term(val) {
        return Array.isArray(val) ? `(${val.join(',')})` : String(val);
    }
}
