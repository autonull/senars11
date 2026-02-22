export class PathPlanner {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = config;
    }

    async plan(startState, goal) {
        if (!this.bridge) return null;

        try {
            const result = await this.bridge.ask(`<( ${startState} ) --> (path-to, ${goal})>?`);
            return result?.answer ? result.term : null;
        } catch {
            return null;
        }
    }
}
