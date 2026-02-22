import { RLAgent } from '../core/RLAgent.js';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { Tensor, AdamOptimizer } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    gamma: 0.99,
    lambda: 0.95,
    epsilonClip: 0.2,
    learningRate: 0.0003,
    updateSteps: 200,
    batchSize: 64,
    hiddenSize: 64,
    epochs: 4,
    criticLossWeight: 0.5
};

const NetworkBuilder = {
    buildMLP(input, hidden, output) {
        const w1 = Tensor.randn([hidden, input], 0, 0.1);
        const b1 = Tensor.zeros([hidden]);
        const w2 = Tensor.randn([output, hidden], 0, 0.1);
        const b2 = Tensor.zeros([output]);

        [w1, b1, w2, b2].forEach(p => p.requiresGrad = true);

        return { w1, b1, w2, b2, params: [w1, b1, w2, b2] };
    },

    forward(model, x) {
        let input = x.ndim === 1 ? x.reshape([x.shape[0], 1]) : x.transpose();
        const h = model.w1.matmul(input).add(model.b1.reshape([model.b1.shape[0], 1])).relu();
        const out = model.w2.matmul(h).add(model.b2.reshape([model.b2.shape[0], 1]));
        return x.ndim > 1 ? out.transpose() : out.reshape([out.shape[0]]);
    },

    sampleAction(probs) {
        const r = Math.random();
        let cumSum = 0;
        for (let i = 0; i < probs.data.length; i++) {
            cumSum += probs.data[i];
            if (r <= cumSum) return i;
        }
        return probs.data.length - 1;
    },

    createActionMask(actions, actionDim, batchLen) {
        const maskData = new Array(batchLen * actionDim).fill(0);
        actions.forEach((a, i) => {
            maskData[i * actionDim + a] = 1;
        });
        return new Tensor(maskData).reshape([batchLen, actionDim]);
    },

    computeGAE(values, rewards, dones, gamma, lambda, lastNextVal = 0) {
        const advantages = new Array(values.length).fill(0);
        const returns = new Array(values.length).fill(0);

        let lastGaeLam = 0;
        for (let t = values.length - 1; t >= 0; t--) {
            const nextVal = t === values.length - 1 ? lastNextVal : values[t + 1];
            const mask = dones[t] ? 0 : 1;
            const delta = rewards[t] + gamma * nextVal * mask - values[t];
            lastGaeLam = delta + gamma * lambda * mask * lastGaeLam;
            advantages[t] = lastGaeLam;
            returns[t] = advantages[t] + values[t];
        }

        return { advantages, returns };
    }
};

export class PPOAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = mergeConfig(DEFAULTS, config);

        this.optimizer = new AdamOptimizer(this.config.learningRate);
        this._initNetwork();

        this.replayBuffer = new ExperienceBuffer({
            capacity: this.config.updateSteps * 10,
            batchSize: this.config.batchSize,
            sampleStrategy: 'random',
            useCausalIndexing: false
        });
    }

    async initialize() {
        await this.replayBuffer.initialize();
    }

    _initNetwork() {
        const obsDim = this.env.observationSpace.shape[0];
        const actionDim = this.env.actionSpace.n;

        this.actor = NetworkBuilder.buildMLP(obsDim, this.config.hiddenSize, actionDim);
        this.critic = NetworkBuilder.buildMLP(obsDim, this.config.hiddenSize, 1);
        this.params = [...this.actor.params, ...this.critic.params];
    }

    act(observation) {
        const obsTensor = new Tensor(observation);
        const logits = NetworkBuilder.forward(this.actor, obsTensor);
        const probs = logits.softmax();

        return NetworkBuilder.sampleAction(probs);
    }

    async learn(obs, action, reward, nextObs, done) {
        const experience = new CausalExperience({ state: obs, action, reward, nextState: nextObs, done });
        await this.replayBuffer.store(experience);

        if (this.replayBuffer.totalSize >= this.config.updateSteps) {
            await this._update();
        }
    }

    async _update() {
        const batch = await this.replayBuffer.sample(this.replayBuffer.totalSize);
        if (batch.length === 0) return;

        const obsDim = this.env.observationSpace.shape[0];
        const actionDim = this.env.actionSpace.n;

        const states = new Tensor(batch.flatMap(x => x.state)).reshape([batch.length, obsDim]);
        const actions = batch.map(x => x.action);
        const rewards = batch.map(x => x.reward);
        const dones = batch.map(x => x.done);

        const values = NetworkBuilder.forward(this.critic, states).data;
        const lastNextObs = new Tensor(batch[batch.length - 1].nextState);
        const lastNextVal = NetworkBuilder.forward(this.critic, lastNextObs).data[0] ?? 0;

        const { advantages, returns } = NetworkBuilder.computeGAE(
            values, rewards, dones, this.config.gamma, this.config.lambda, lastNextVal
        );

        const actionMask = NetworkBuilder.createActionMask(actions, actionDim, batch.length);
        const advTensor = new Tensor(advantages).reshape([batch.length, 1]);
        const retTensor = new Tensor(returns).reshape([batch.length, 1]);

        for (let epoch = 0; epoch < this.config.epochs; epoch++) {
            const logits = NetworkBuilder.forward(this.actor, states);
            const newValues = NetworkBuilder.forward(this.critic, states);

            const logProbs = logits.softmax().log().mul(actionMask).sum(1);

            const policyLoss = logProbs.mul(advTensor).mean().mul(-1);
            const valueLoss = newValues.sub(retTensor).pow(2).mean();
            const loss = policyLoss.add(valueLoss.mul(this.config.criticLossWeight));

            this.optimizer.zeroGrad(this.params);
            loss.backward();
            this.optimizer.step(this.params);
        }

        this.replayBuffer.clearOld(0);
    }

    async getBufferStats() {
        return this.replayBuffer.getStats();
    }

    async close() {
        await this.replayBuffer.shutdown();
    }
}
