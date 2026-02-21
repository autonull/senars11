import { RLAgent } from '../core/RLAgent.js';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { Tensor, AdamOptimizer, LossFunctor } from '@senars/tensor';

export class DQNAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = {
            gamma: 0.99,
            epsilon: 1.0,
            epsilonMin: 0.01,
            epsilonDecay: 0.995,
            learningRate: 0.001,
            batchSize: 64,
            memorySize: 10000,
            hiddenSize: 64,
            targetUpdate: 100,
            useCausalIndexing: config.useCausalIndexing ?? false,
            ...config
        };

        this.steps = 0;
        this.optimizer = new AdamOptimizer(this.config.learningRate);
        this.lossFn = new LossFunctor();

        // Use ExperienceBuffer instead of raw array
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

    _updateTargetNetwork() {
        this.targetNet.w1.data = [...this.qNet.w1.data];
        this.targetNet.b1.data = [...this.qNet.b1.data];
        this.targetNet.w2.data = [...this.qNet.w2.data];
        this.targetNet.b2.data = [...this.qNet.b2.data];
    }

    act(observation) {
        if (Math.random() < this.config.epsilon) {
            return Math.floor(Math.random() * this.env.actionSpace.n);
        }

        const obsTensor = new Tensor(observation);
        const qValues = this._forward(this.qNet, obsTensor);
        const data = qValues.data;
        let maxIdx = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] > data[maxIdx]) maxIdx = i;
        }
        return maxIdx;
    }

    async learn(obs, action, reward, nextObs, done) {
        // Store experience in ExperienceBuffer
        const experience = new CausalExperience({
            state: obs,
            action,
            reward,
            nextState: nextObs,
            done
        });
        await this.replayBuffer.store(experience);

        // Decay epsilon
        if (done && this.config.epsilon > this.config.epsilonMin) {
            this.config.epsilon *= this.config.epsilonDecay;
        }

        this.steps++;
        if (this.steps % this.config.targetUpdate === 0) {
            this._updateTargetNetwork();
        }

        // Train if enough samples
        if (this.replayBuffer.totalSize >= this.config.batchSize) {
            await this._trainStep();
        }
    }

    async _trainStep() {
        // Sample batch from ExperienceBuffer
        const batch = await this.replayBuffer.sample(this.config.batchSize);
        if (batch.length === 0) return;

        const obsDim = this.env.observationSpace.shape[0];
        const actionDim = this.env.actionSpace.n;
        const batchSize = batch.length;

        const states = new Tensor(batch.flatMap(e => e.state)).reshape([batchSize, obsDim]);
        const nextStates = new Tensor(batch.flatMap(e => e.nextState)).reshape([batchSize, obsDim]);
        const actions = batch.map(e => e.action);
        const rewards = batch.map(e => e.reward);
        const dones = batch.map(e => e.done);

        // Compute Target Q
        const nextQ = this._forward(this.targetNet, nextStates);
        const maxNextQ = [];
        const nextQData = nextQ.data;

        for (let i = 0; i < batchSize; i++) {
            if (dones[i]) {
                maxNextQ.push(0);
            } else {
                let maxVal = -Infinity;
                for (let j = 0; j < actionDim; j++) {
                    const val = nextQData[i * actionDim + j];
                    if (val > maxVal) maxVal = val;
                }
                maxNextQ.push(maxVal);
            }
        }

        const targets = rewards.map((r, i) => r + this.config.gamma * maxNextQ[i]);
        const currentQ = this._forward(this.qNet, states);

        // Construct mask and target tensors
        const maskData = new Array(batchSize * actionDim).fill(0);
        const targetData = new Array(batchSize * actionDim).fill(0);

        for (let i = 0; i < batchSize; i++) {
            const idx = i * actionDim + actions[i];
            maskData[idx] = 1;
            targetData[idx] = targets[i];
        }

        const mask = new Tensor(maskData).reshape([batchSize, actionDim]);
        const targetTensor = new Tensor(targetData).reshape([batchSize, actionDim]);

        const diff = currentQ.sub(targetTensor).mul(mask);
        const loss = diff.pow(2).mean();

        this.optimizer.zeroGrad(this.qNet.params);
        loss.backward();
        this.optimizer.step(this.qNet.params);
    }

    async getBufferStats() {
        return this.replayBuffer.getStats();
    }

    async close() {
        await this.replayBuffer.shutdown();
    }
}
