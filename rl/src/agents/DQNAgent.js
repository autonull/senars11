import { RLAgent } from '../core/RLAgent.js';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { Tensor, AdamOptimizer, LossFunctor } from '@senars/tensor';
import { PolicyUtils } from '../utils/PolicyUtils.js';

const DQN_DEFAULTS = {
    gamma: 0.99,
    epsilon: 1.0,
    epsilonMin: 0.01,
    epsilonDecay: 0.995,
    learningRate: 0.001,
    batchSize: 64,
    memorySize: 10000,
    hiddenSize: 64,
    targetUpdate: 100,
    useCausalIndexing: false
};

const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

export class DQNAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = mergeConfig(DQN_DEFAULTS, config);
        this.steps = 0;
        this.optimizer = new AdamOptimizer(this.config.learningRate);
        this.lossFn = new LossFunctor();
        this.replayBuffer = new ExperienceBuffer({
            capacity: this.config.memorySize,
            batchSize: this.config.batchSize,
            sampleStrategy: 'random',
            useCausalIndexing: this.config.useCausalIndexing
        });

        this._initNetworks();
    }

    async initialize() {
        await this.replayBuffer.initialize();
    }

    _initNetworks() {
        const obsDim = this.env.observationSpace.shape[0];
        const actionDim = this.env.actionSpace.n;
        this.qNet = this._buildModel(obsDim, this.config.hiddenSize, actionDim);
        this.targetNet = this._buildModel(obsDim, this.config.hiddenSize, actionDim);
        this._updateTargetNetwork();
    }

    _buildModel(input, hidden, output) {
        const params = [
            Tensor.randn([hidden, input], 0, 0.1),
            Tensor.zeros([hidden]),
            Tensor.randn([output, hidden], 0, 0.1),
            Tensor.zeros([output])
        ].map(p => (p.requiresGrad = true, p));

        return { w1: params[0], b1: params[1], w2: params[2], b2: params[3], params };
    }

    _forward(model, x) {
        const input = x.ndim === 1 ? x.reshape([x.shape[0], 1]) : x.transpose();
        const h = model.w1.matmul(input).add(model.b1.reshape([model.b1.shape[0], 1])).relu();
        const out = model.w2.matmul(h).add(model.b2.reshape([model.b2.shape[0], 1]));
        return x.ndim > 1 ? out.transpose() : out.reshape([out.shape[0]]);
    }

    _updateTargetNetwork() {
        ['w1', 'b1', 'w2', 'b2'].forEach(key => {
            this.targetNet[key].data = [...this.qNet[key].data];
        });
    }

    act(observation) {
        if (Math.random() < this.config.epsilon) {
            return Math.floor(Math.random() * this.env.actionSpace.n);
        }

        const qValues = this._forward(this.qNet, new Tensor(observation));
        return PolicyUtils.argmax(qValues.data);
    }

    async learn(obs, action, reward, nextObs, done) {
        await this.replayBuffer.store(new CausalExperience({ state: obs, action, reward, nextState: nextObs, done }));

        if (done && this.config.epsilon > this.config.epsilonMin) {
            this.config.epsilon *= this.config.epsilonDecay;
        }

        if (++this.steps % this.config.targetUpdate === 0) {
            this._updateTargetNetwork();
        }

        if (this.replayBuffer.totalSize >= this.config.batchSize) {
            await this._trainStep();
        }
    }

    async _trainStep() {
        const batch = await this.replayBuffer.sample(this.config.batchSize);
        if (!batch.length) return;

        const obsDim = this.env.observationSpace.shape[0];
        const actionDim = this.env.actionSpace.n;
        const batchSize = batch.length;

        const states = new Tensor(batch.flatMap(e => e.state)).reshape([batchSize, obsDim]);
        const nextStates = new Tensor(batch.flatMap(e => e.nextState)).reshape([batchSize, obsDim]);
        const actions = batch.map(e => e.action);
        const rewards = batch.map(e => e.reward);
        const dones = batch.map(e => e.done);

        const nextQ = this._forward(this.targetNet, nextStates);
        const maxNextQ = this._computeMaxNextQ(nextQ.data, dones, batchSize, actionDim);
        const targets = rewards.map((r, i) => r + this.config.gamma * maxNextQ[i]);

        const currentQ = this._forward(this.qNet, states);
        const { mask, targetTensor } = this._createTargetTensors(currentQ, targets, actions, batchSize, actionDim);

        const loss = currentQ.sub(targetTensor).mul(mask).pow(2).mean();
        this.optimizer.zeroGrad(this.qNet.params);
        loss.backward();
        this.optimizer.step(this.qNet.params);
    }

    _computeMaxNextQ(nextQData, dones, batchSize, actionDim) {
        return Array.from({ length: batchSize }, (_, i) => {
            if (dones[i]) return 0;
            const offset = i * actionDim;
            return Math.max(...nextQData.slice(offset, offset + actionDim));
        });
    }

    _createTargetTensors(currentQ, targets, actions, batchSize, actionDim) {
        const maskData = new Array(batchSize * actionDim).fill(0);
        const targetData = new Array(batchSize * actionDim).fill(0);

        actions.forEach((action, i) => {
            const idx = i * actionDim + action;
            maskData[idx] = 1;
            targetData[idx] = targets[i];
        });

        return {
            mask: new Tensor(maskData).reshape([batchSize, actionDim]),
            targetTensor: new Tensor(targetData).reshape([batchSize, actionDim])
        };
    }

    async getBufferStats() {
        return this.replayBuffer.getStats();
    }

    async close() {
        await this.replayBuffer.shutdown();
    }
}
