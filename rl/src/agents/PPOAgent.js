import { RLAgent } from '../core/RLAgent.js';
import { ExperienceBuffer, CausalExperience } from '../experience/ExperienceBuffer.js';
import { Tensor, AdamOptimizer } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { NetworkBuilder } from '../utils/NetworkBuilder.js';

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
