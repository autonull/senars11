
import { RLEnvironment } from '../core/RLEnvironment.js';

export class CartPole extends RLEnvironment {
    constructor() {
        super();
        this.gravity = 9.8;
        this.masscart = 1.0;
        this.masspole = 0.1;
        this.total_mass = this.masscart + this.masspole;
        this.length = 0.5; // half the pole's length
        this.polemass_length = this.masspole * this.length;
        this.force_mag = 10.0;
        this.tau = 0.02; // seconds between state updates

        // Angle at which to fail the episode
        this.theta_threshold_radians = 12 * 2 * Math.PI / 360;
        this.x_threshold = 2.4;

        this.reset();
    }

    reset() {
        // Start with random state [-0.05, 0.05]
        this.state = Array.from({ length: 4 }, () => Math.random() * 0.1 - 0.05);
        this.steps_beyond_done = null;
        this.currentSteps = 0;
        return { observation: [...this.state], info: {} };
    }

    step(action) {
        let [x, x_dot, theta, theta_dot] = this.state;
        const force = action === 1 ? this.force_mag : -this.force_mag;
        const costheta = Math.cos(theta);
        const sintheta = Math.sin(theta);

        const temp = (force + this.polemass_length * theta_dot * theta_dot * sintheta) / this.total_mass;
        const thetaacc = (this.gravity * sintheta - costheta * temp) / (this.length * (4.0 / 3.0 - this.masspole * costheta * costheta / this.total_mass));
        const xacc = temp - this.polemass_length * thetaacc * costheta / this.total_mass;

        x = x + this.tau * x_dot;
        x_dot = x_dot + this.tau * xacc;
        theta = theta + this.tau * theta_dot;
        theta_dot = theta_dot + this.tau * thetaacc;

        this.state = [x, x_dot, theta, theta_dot];

        const done = x < -this.x_threshold || x > this.x_threshold ||
                     theta < -this.theta_threshold_radians || theta > this.theta_threshold_radians;

        let reward;
        if (!done) {
            reward = 1.0;
        } else if (this.steps_beyond_done === null) {
            // Pole just fell!
            this.steps_beyond_done = 0;
            reward = 1.0;
        } else {
            if (this.steps_beyond_done === 0) {
                 // console.warn("You are calling 'step()' even though this environment has already returned done = true. You should always call 'reset()' once you receive 'done = true' -- any further steps are undefined behavior.");
            }
            this.steps_beyond_done += 1;
            reward = 0.0;
        }

        this.currentSteps++;
        // Truncate at 500 steps (standard CartPole-v1 limit)
        const truncated = this.currentSteps >= 500;

        return {
            observation: [...this.state],
            reward,
            terminated: done,
            truncated,
            info: {}
        };
    }

    get observationSpace() {
        const high = [4.8, Infinity, 24 * 2 * Math.PI / 360, Infinity];
        return {
            type: 'Box',
            shape: [4],
            low: high.map(v => -v),
            high
        };
    }

    get actionSpace() {
        return { type: 'Discrete', n: 2 };
    }
}
