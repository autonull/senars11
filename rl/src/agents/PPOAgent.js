import { RLAgent } from '../core/RLAgent.js';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { Tensor, AdamOptimizer } from '@senars/tensor';

export class PPOAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = {
            gamma: 0.99,
            lambda: 0.95,
            epsilonClip: 0.2,
            learningRate: 0.0003,
            updateSteps: 200,
            batchSize: 64,
            hiddenSize: 64,
            epochs: 4,
            ...config
        };

        this.optimizer = new AdamOptimizer(this.config.learningRate);
        this._initNetwork();

        // Use ExperienceBuffer instead of raw array
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

        this.actor = this._buildMLP(obsDim, this.config.hiddenSize, actionDim);
        this.critic = this._buildMLP(obsDim, this.config.hiddenSize, 1);
        this.params = [...this.actor.params, ...this.critic.params];
    }

    _buildMLP(input, hidden, output) {
        const w1 = Tensor.randn([hidden, input], 0, 0.1);
        const b1 = Tensor.zeros([hidden]);
        const w2 = Tensor.randn([output, hidden], 0, 0.1);
        const b2 = Tensor.zeros([output]);

        w1.requiresGrad = true;
        b1.requiresGrad = true;
        w2.requiresGrad = true;
        b2.requiresGrad = true;

        return { w1, b1, w2, b2, params: [w1, b1, w2, b2] };
    }

    _forward(model, x) {
        let input = x.ndim === 1 ? x.reshape([x.shape[0], 1]) : x.transpose();
        const h = model.w1.matmul(input).add(model.b1.reshape([model.b1.shape[0], 1])).relu();
        const out = model.w2.matmul(h).add(model.b2.reshape([model.b2.shape[0], 1]));
        return x.ndim > 1 ? out.transpose() : out.reshape([out.shape[0]]);
    }

    act(observation) {
        const obsTensor = new Tensor(observation);
        const logits = this._forward(this.actor, obsTensor);
        const probs = logits.softmax();

        const r = Math.random();
        let cumSum = 0;
        const data = probs.data;
        for (let i = 0; i < data.length; i++) {
            cumSum += data[i];
            if (r <= cumSum) return i;
        }
        return data.length - 1;
    }

    async learn(obs, action, reward, nextObs, done) {
        // Store experience
        const experience = new CausalExperience({ state: obs, action, reward, nextState: nextObs, done });
        await this.replayBuffer.store(experience);

        if (this.replayBuffer.totalSize >= this.config.updateSteps) {
            await this._update();
        }
    }

    async _update() {
        // Sample batch from buffer
        const batch = await this.replayBuffer.sample(this.replayBuffer.totalSize);
        if (batch.length === 0) return;

        const obsDim = this.env.observationSpace.shape[0];
        const states = new Tensor(batch.flatMap(x => x.state)).reshape([batch.length, obsDim]);
        const actions = batch.map(x => x.action);
        const rewards = batch.map(x => x.reward);
        const dones = batch.map(x => x.done);

        // Calculate Returns & Advantages (GAE)
        const values = this._forward(this.critic, states).data;
        const advantages = new Array(batch.length).fill(0);
        const returns = new Array(batch.length).fill(0);

        let lastGaeLam = 0;
        const lastNextObs = new Tensor(batch[batch.length - 1].nextState);
        const lastNextVal = this._forward(this.critic, lastNextObs).data[0] ?? 0;

        for (let t = batch.length - 1; t >= 0; t--) {
            const nextVal = t === batch.length - 1 ? lastNextVal : values[t + 1];
            const mask = dones[t] ? 0 : 1;
            const delta = rewards[t] + this.config.gamma * nextVal * mask - values[t];
            lastGaeLam = delta + this.config.gamma * this.config.lambda * mask * lastGaeLam;
            advantages[t] = lastGaeLam;
            returns[t] = advantages[t] + values[t];
        }

        // PPO Epochs
        for (let epoch = 0; epoch < this.config.epochs; epoch++) {
            const logits = this._forward(this.actor, states);
            const newValues = this._forward(this.critic, states);

            const actionDim = this.env.actionSpace.n;
            const maskData = new Array(batch.length * actionDim).fill(0);
            for (let i = 0; i < batch.length; i++) {
                maskData[i * actionDim + actions[i]] = 1;
            }
            const actionMask = new Tensor(maskData).reshape([batch.length, actionDim]);

            const logProbs = logits.softmax().log().mul(actionMask).sum(1);
            const advTensor = new Tensor(advantages).reshape([batch.length, 1]);
            const retTensor = new Tensor(returns).reshape([batch.length, 1]);

            const policyLoss = logProbs.mul(advTensor).mean().mul(-1);
            const valueLoss = newValues.sub(retTensor).pow(2).mean();
            const loss = policyLoss.add(valueLoss.mul(0.5));

            this.optimizer.zeroGrad(this.params);
            loss.backward();
            this.optimizer.step(this.params);
        }

        // Clear buffer after update
        this.replayBuffer.clearOld(0);
    }

    async getBufferStats() {
        return this.replayBuffer.getStats();
    }

    async close() {
        await this.replayBuffer.shutdown();
    }
}
