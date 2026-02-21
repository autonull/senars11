
import { RLEnvironment } from '../core/RLEnvironment.js';

export class Continuous1D extends RLEnvironment {
    constructor() {
        super();
        this.maxPosition = 2.0;
        this.maxSpeed = 0.5;
        this.dt = 0.1;
        this.goalThreshold = 0.1;
        this.maxSteps = 200;
        this.reset();
    }

    reset() {
        let pos = (Math.random() * 3) - 1.5;
        if (Math.abs(pos) < 0.2) pos = 1.0;
        this.state = [pos, 0.0];
        this.currentSteps = 0;
        return { observation: [...this.state], info: {} };
    }

    step(action) {
        this.currentSteps++;
        let [pos, vel] = this.state;
        const force = Math.max(-1.0, Math.min(1.0, Array.isArray(action) ? action[0] : action));

        vel += force * this.dt;
        vel = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, vel));

        pos += vel * this.dt;
        pos = Math.max(-this.maxPosition, Math.min(this.maxPosition, pos));
        this.state = [pos, vel];

        const dist = Math.abs(pos);
        const reward = -dist - 0.1 * (force ** 2);
        const terminated = dist < this.goalThreshold && Math.abs(vel) < 0.1;

        return {
            observation: [...this.state],
            reward,
            terminated,
            truncated: this.currentSteps >= this.maxSteps,
            info: {}
        };
    }

    get observationSpace() {
        return { type: 'Box', shape: [2], low: [-this.maxPosition, -this.maxSpeed], high: [this.maxPosition, this.maxSpeed] };
    }

    get actionSpace() {
        return { type: 'Box', shape: [1], low: [-1.0], high: [1.0] };
    }
}
