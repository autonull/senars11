import {Environment} from '../core/RLCore.js';

const PHYSICS = {
    gravity: 9.8,
    masscart: 1.0,
    masspole: 0.1,
    length: 0.5,
    tau: 0.02,
    forceMag: 10.0,
    xThreshold: 2.4,
    thetaThresholdRadians: 12 * 2 * Math.PI / 360,
    maxSteps: 500
};

export class CartPole extends Environment {
    constructor() {
        super();
        Object.assign(this, PHYSICS);
        this.totalMass = this.masscart + this.masspole;
        this.polemassLength = this.masspole * this.length;
        this.reset();
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
        return {type: 'Discrete', n: 2};
    }

    reset() {
        this.state = Array.from({length: 4}, () => Math.random() * 0.1 - 0.05);
        this.stepsBeyondDone = null;
        this.currentSteps = 0;
        return {observation: [...this.state], info: {}};
    }

    step(action) {
        const [x, xDot, theta, thetaDot] = this.state;
        const force = action === 1 ? this.forceMag : -this.forceMag;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        const temp = (force + this.polemassLength * thetaDot * thetaDot * sinTheta) / this.totalMass;
        const thetaAcc = (this.gravity * sinTheta - cosTheta * temp) /
            (this.length * (4.0 / 3.0 - this.masspole * cosTheta * cosTheta / this.totalMass));
        const xAcc = temp - this.polemassLength * thetaAcc * cosTheta / this.totalMass;

        this.state = [
            x + this.tau * xDot,
            xDot + this.tau * xAcc,
            theta + this.tau * thetaDot,
            thetaDot + this.tau * thetaAcc
        ];

        const done = this._isDone(this.state);
        const reward = this._computeReward(done);
        this.currentSteps++;

        return {
            observation: [...this.state],
            reward,
            terminated: done,
            truncated: this.currentSteps >= this.maxSteps,
            info: {}
        };
    }

    _isDone([x, , theta]) {
        return x < -this.xThreshold || x > this.xThreshold ||
            theta < -this.thetaThresholdRadians || theta > this.thetaThresholdRadians;
    }

    _computeReward(done) {
        if (!done) {
            return 1.0;
        }
        if (this.stepsBeyondDone === null) {
            this.stepsBeyondDone = 0;
            return 1.0;
        }
        this.stepsBeyondDone += 1;
        return 0.0;
    }
}
