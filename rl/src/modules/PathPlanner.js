const PLANNER_DEFAULTS = {
    maxPathLength: 100,
    timeout: 5000,
    useCache: true
};

const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

export class PathPlanner {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = mergeConfig(PLANNER_DEFAULTS, config);
        this.pathCache = new Map();
    }

    async plan(startState, goal) {
        if (!this.bridge) return null;

        const cacheKey = `${startState}_to_${goal}`;
        if (this.config.useCache && this.pathCache.has(cacheKey)) {
            return this.pathCache.get(cacheKey);
        }

        try {
            const result = await this.bridge.ask(`<( ${startState} ) --> (path-to, ${goal})>?`);
            const path = result?.answer ? result.term : null;
            if (this.config.useCache && path) {
                this.pathCache.set(cacheKey, path);
            }
            return path;
        } catch {
            return null;
        }
    }

    clearCache() {
        this.pathCache.clear();
    }
}
