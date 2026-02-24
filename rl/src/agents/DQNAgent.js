import { RLAgent } from '../core/RLAgent.js';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { Tensor, AdamOptimizer, LossFunctor } from '@senars/tensor';
import { PolicyUtils } from '../utils/PolicyUtils.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { NetworkBuilder } from '../utils/NetworkBuilder.js';

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
        this.qNet = NetworkBuilder.buildMLP(obsDim, this.config.hiddenSize, actionDim);
        this.targetNet = NetworkBuilder.buildMLP(obsDim, this.config.hiddenSize, actionDim);
        this._updateTargetNetwork();
    }

    _updateTargetNetwork() {
        for (const key of ['w1', 'b1', 'w2', 'b2']) {
            if (this.qNet[key]) {
                 this.targetNet[key].data = [...this.qNet[key].data];
            }
        }
    }

    act(observation) {
        if (Math.random() < this.config.epsilon) {
            return Math.floor(Math.random() * this.env.actionSpace.n);
        }

        const qValues = NetworkBuilder.forward(this.qNet, new Tensor(observation));
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

        const flatStates = new Float32Array(batchSize * obsDim);
        const flatNextStates = new Float32Array(batchSize * obsDim);
        const actions = new Int32Array(batchSize);
        const rewards = new Float32Array(batchSize);
        const dones = new Uint8Array(batchSize);

        for (let i = 0; i < batchSize; i++) {
            const e = batch[i];
            const s = e.state;
            const ns = e.nextState;

            if (s.length === obsDim) {
                flatStates.set(s, i * obsDim);
            } else {
                 for(let j=0; j<obsDim; j++) flatStates[i*obsDim + j] = s[j];
            }

            if (ns.length === obsDim) {
                flatNextStates.set(ns, i * obsDim);
            } else {
                 for(let j=0; j<obsDim; j++) flatNextStates[i*obsDim + j] = ns[j];
            }

            actions[i] = e.action;
            rewards[i] = e.reward;
            dones[i] = e.done ? 1 : 0;
        }

        const states = new Tensor(flatStates).reshape([batchSize, obsDim]);
        const nextStates = new Tensor(flatNextStates).reshape([batchSize, obsDim]);

        const nextQ = NetworkBuilder.forward(this.targetNet, nextStates);
        const maxNextQ = this._computeMaxNextQ(nextQ.data, dones, batchSize, actionDim);

        const targets = new Float32Array(batchSize);
        for(let i=0; i<batchSize; i++) {
            targets[i] = rewards[i] + this.config.gamma * maxNextQ[i];
        }

        const currentQ = NetworkBuilder.forward(this.qNet, states);
        const { mask, targetTensor } = this._createTargetTensors(targets, actions, batchSize, actionDim);

        const loss = currentQ.sub(targetTensor).mul(mask).pow(2).mean();
        this.optimizer.zeroGrad(this.qNet.params);
        loss.backward();
        this.optimizer.step(this.qNet.params);
    }

    _computeMaxNextQ(nextQData, dones, batchSize, actionDim) {
        const maxQ = new Float32Array(batchSize);
        for(let i=0; i<batchSize; i++) {
            if (dones[i]) {
                maxQ[i] = 0;
                continue;
            }
            let maxVal = -Infinity;
            const offset = i * actionDim;
            for(let j=0; j<actionDim; j++) {
                const val = nextQData[offset + j];
                if (val > maxVal) maxVal = val;
            }
            maxQ[i] = maxVal;
        }
        return maxQ;
    }

    _createTargetTensors(targets, actions, batchSize, actionDim) {
        const maskData = new Float32Array(batchSize * actionDim);
        const targetData = new Float32Array(batchSize * actionDim);

        for(let i=0; i<batchSize; i++) {
            const idx = i * actionDim + actions[i];
            maskData[idx] = 1;
            targetData[idx] = targets[i];
        }

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
