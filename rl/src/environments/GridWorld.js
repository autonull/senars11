import { RLEnvironment } from '../core/RLEnvironment.js';

const GRID_DEFAULTS = {
    size: 5,
    start: [0, 0],
    goal: [4, 4],
    obstacles: [],
    maxStepsMultiplier: 2,
    goalReward: 10,
    stepPenalty: -0.1
};

const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

export class GridWorld extends RLEnvironment {
    constructor(config = {}) {
        super();
        const merged = typeof config === 'number'
            ? mergeConfig(GRID_DEFAULTS, { size: config })
            : mergeConfig(GRID_DEFAULTS, config);
        
        this.size = merged.size;
        this.start = merged.start;
        this.goal = merged.goal;
        this.obstacles = merged.obstacles;
        this.maxSteps = merged.size * merged.size * merged.maxStepsMultiplier;
        this.goalReward = merged.goalReward;
        this.stepPenalty = merged.stepPenalty;
        this.reset();
    }

    reset() {
        this.state = [...this.start];
        this.currentSteps = 0;
        return { observation: [...this.state], info: {} };
    }

    step(action) {
        this.currentSteps++;
        const [x, y] = this.state;
        const deltas = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        const [dx, dy] = deltas[action] ?? [0, 0];

        const newX = Math.max(0, Math.min(this.size - 1, x + dx));
        const newY = Math.max(0, Math.min(this.size - 1, y + dy));

        if (!this.obstacles.some(([ox, oy]) => ox === newX && oy === newY)) {
            this.state = [newX, newY];
        }

        const [gx, gy] = this.goal;
        const terminated = this.state[0] === gx && this.state[1] === gy;
        const truncated = this.currentSteps >= this.maxSteps;

        return {
            observation: [...this.state],
            reward: terminated ? this.goalReward : this.stepPenalty,
            terminated,
            truncated,
            info: {}
        };
    }

    get observationSpace() {
        return { type: 'Box', shape: [2], low: [0, 0], high: [this.size - 1, this.size - 1] };
    }

    get actionSpace() {
        return { type: 'Discrete', n: 4 };
    }
}
