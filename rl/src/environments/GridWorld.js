
import { RLEnvironment } from '../core/RLEnvironment.js';

/**
 * A simple 2D GridWorld environment.
 * Discrete State Space: (x, y)
 * Discrete Action Space: 0: Up, 1: Down, 2: Left, 3: Right
 */
export class GridWorld extends RLEnvironment {
    constructor(size = 5, start = [0, 0], goal = [4, 4], obstacles = []) {
        super();
        this.size = size;
        this.start = start;
        this.goal = goal;
        this.obstacles = obstacles; // Array of [x, y]
        this.state = [...this.start];
        this.maxSteps = size * size * 2;
        this.currentSteps = 0;
    }

    reset() {
        this.state = [...this.start];
        this.currentSteps = 0;
        return { observation: [...this.state], info: {} };
    }

    step(action) {
        this.currentSteps++;
        let [x, y] = this.state;
        let reward = -0.1; // Small penalty for each step
        let terminated = false;
        let truncated = false;

        // Move
        if (action === 0) y = Math.max(0, y - 1); // Up
        else if (action === 1) y = Math.min(this.size - 1, y + 1); // Down
        else if (action === 2) x = Math.max(0, x - 1); // Left
        else if (action === 3) x = Math.min(this.size - 1, x + 1); // Right

        // Check obstacles
        if (this.obstacles.some(o => o[0] === x && o[1] === y)) {
            // Hit obstacle: stay in place (or maybe terminate with negative reward?)
            // For now, stay in place
            x = this.state[0];
            y = this.state[1];
        }

        this.state = [x, y];

        // Check Goal
        if (x === this.goal[0] && y === this.goal[1]) {
            reward = 10;
            terminated = true;
        }

        // Check Max Steps
        if (this.currentSteps >= this.maxSteps) {
            truncated = true;
        }

        return {
            observation: [...this.state],
            reward,
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
