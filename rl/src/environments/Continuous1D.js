
import { RLEnvironment } from '../core/RLEnvironment.js';

/**
 * A simple 1D Continuous Control environment.
 * Goal: Move agent (point on line) to target (0).
 * State: [position, velocity]
 * Action: [force] (-1.0 to 1.0)
 */
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
        // Random start position between -1.5 and 1.5, avoiding 0
        let startPos = (Math.random() * 3) - 1.5;
        if (Math.abs(startPos) < 0.2) startPos = 1.0;

        this.state = [startPos, 0.0]; // pos, vel
        this.currentSteps = 0;
        return { observation: [...this.state], info: {} };
    }

    step(action) {
        // Action is a float or array of 1 float
        let force = Array.isArray(action) ? action[0] : action;
        // Clip action
        force = Math.max(-1.0, Math.min(1.0, force));

        this.currentSteps++;
        let [pos, vel] = this.state;

        // Dynamics: Simple physics
        // F = ma (m=1), a = F
        // v = v + a*dt
        // p = p + v*dt
        vel += force * this.dt;
        vel = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, vel));

        pos += vel * this.dt;
        pos = Math.max(-this.maxPosition, Math.min(this.maxPosition, pos));

        this.state = [pos, vel];

        // Reward: Negative distance to goal (0) minus small action penalty
        const dist = Math.abs(pos);
        const reward = -dist - 0.1 * (force * force);

        let terminated = false;
        let truncated = false;

        if (dist < this.goalThreshold && Math.abs(vel) < 0.1) {
            terminated = true;
            // Bonus for reaching goal
            // reward += 10.0; // Standard continuous tasks usually don't give sparse bonuses, but let's see
        }

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
        return {
            type: 'Box',
            shape: [2],
            low: [-this.maxPosition, -this.maxSpeed],
            high: [this.maxPosition, this.maxSpeed]
        };
    }

    get actionSpace() {
        return {
            type: 'Box',
            shape: [1],
            low: [-1.0],
            high: [1.0]
        };
    }
}
