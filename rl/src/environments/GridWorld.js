
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
        let [x, y] = this.state;

        switch (action) {
            case 0: y = Math.max(0, y - 1); break;
            case 1: y = Math.min(this.size - 1, y + 1); break;
            case 2: x = Math.max(0, x - 1); break;
            case 3: x = Math.min(this.size - 1, x + 1); break;
        }

        if (this.obstacles.some(([ox, oy]) => ox === x && oy === y)) {
            [x, y] = this.state;
        } else {
            this.state = [x, y];
        }

        const terminated = x === this.goal[0] && y === this.goal[1];
        const truncated = this.currentSteps >= this.size * this.size * 2;
        const reward = terminated ? 10 : -0.1;

        return { observation: [...this.state], reward, terminated, truncated, info: {} };
    }

    get observationSpace() {
        return { type: 'Box', shape: [2], low: [0, 0], high: [this.size - 1, this.size - 1] };
    }

    get actionSpace() {
        return { type: 'Discrete', n: 4 };
    }
}
