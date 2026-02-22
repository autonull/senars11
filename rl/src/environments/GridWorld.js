import { RLEnvironment } from '../core/RLEnvironment.js';

export class GridWorld extends RLEnvironment {
    constructor(size = 5, start = [0, 0], goal = [4, 4], obstacles = []) {
        super();
        this.size = size;
        this.start = start;
        this.goal = goal;
        this.obstacles = obstacles;
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
        const truncated = this.currentSteps >= this.size * this.size * 2;

        return {
            observation: [...this.state],
            reward: terminated ? 10 : -0.1,
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
