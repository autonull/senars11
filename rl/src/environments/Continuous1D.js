import { RLEnvironment } from '../core/RLEnvironment.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    maxPosition: 2.0,
    maxSpeed: 0.5,
    dt: 0.1,
    goalThreshold: 0.1,
    maxSteps: 200,
    positionPenalty: 1.0,
    forcePenalty: 0.1
};

export class Continuous1D extends RLEnvironment {
    constructor(config = {}) {
        super();
        this.config = mergeConfig(DEFAULTS, config);
        this.reset();
    }

    reset() {
        const pos = Math.random() * 3 - 1.5;
        this.state = [Math.abs(pos) < 0.2 ? 1.0 : pos, 0.0];
        this.currentSteps = 0;
        return { observation: [...this.state], info: {} };
    }

    step(action) {
        this.currentSteps++;
        const [pos, vel] = this.state;
        const force = Math.max(-1.0, Math.min(1.0, Array.isArray(action) ? action[0] : action));

        const newVel = Math.max(-this.config.maxSpeed, Math.min(this.config.maxSpeed, vel + force * this.config.dt));
        const newPos = Math.max(-this.config.maxPosition, Math.min(this.config.maxPosition, pos + newVel * this.config.dt));

        this.state = [newPos, newVel];

        const dist = Math.abs(newPos);
        const terminated = dist < this.config.goalThreshold && Math.abs(newVel) < 0.1;

        return {
            observation: [...this.state],
            reward: -this.config.positionPenalty * dist - this.config.forcePenalty * (force ** 2),
            terminated,
            truncated: this.currentSteps >= this.config.maxSteps,
            info: {}
        };
    }

    get observationSpace() {
        return {
            type: 'Box',
            shape: [2],
            low: [-this.config.maxPosition, -this.config.maxSpeed],
            high: [this.config.maxPosition, this.config.maxSpeed]
        };
    }

    get actionSpace() {
        return { type: 'Box', shape: [1], low: [-1.0], high: [1.0] };
    }
}
