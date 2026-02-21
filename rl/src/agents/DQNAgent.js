
import { RLAgent } from '../core/RLAgent.js';
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
            targetUpdate: 100, // Update target network every N steps
            ...config
        };

        this.memory = [];
        this.steps = 0;
        this.optimizer = new AdamOptimizer(this.config.learningRate);
        this.lossFn = new LossFunctor();

        this._initNetworks();
    }

    _initNetworks() {
        const obsDim = this.env.observationSpace.shape[0];
        const actionDim = this.env.actionSpace.n;

        // Q-Network
        this.qNet = this._buildModel(obsDim, this.config.hiddenSize, actionDim);

        // Target Network
        this.targetNet = this._buildModel(obsDim, this.config.hiddenSize, actionDim);
        this._updateTargetNetwork();
    }

    _buildModel(input, hidden, output) {
        // Simple MLP: Input -> Hidden -> ReLU -> Output
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
        // Handle batch or single input
        // x shape: [batch, input] or [input]
        let input = x;
        if (input.ndim === 1) {
            input = input.reshape([input.shape[0], 1]); // Column vector for single
        } else {
             input = input.transpose(); // [input, batch] for matmul
        }

        // h = w1 @ x + b1
        const z1 = model.w1.matmul(input);
        // Broadcast add b1
        // For simple implementation assuming batch size 1 or manual broadcast handling
        // Tensor library might handle broadcasting automatically? Assuming yes or basic

        // Let's assume standard matmul: [hidden, input] x [input, batch] -> [hidden, batch]
        // b1 is [hidden].
        // We need to reshape b1 to [hidden, 1] to broadcast add if batch > 1

        const h = z1.add(model.b1.reshape([model.b1.shape[0], 1])).relu();

        // out = w2 @ h + b2
        const out = model.w2.matmul(h).add(model.b2.reshape([model.b2.shape[0], 1]));

        // Result is [output, batch]. Transpose back to [batch, output] if batch > 1
        if (x.ndim > 1) {
            return out.transpose();
        }
        return out.reshape([out.shape[0]]);
    }

    _updateTargetNetwork() {
        // Deep copy parameters
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

        // Argmax
        const data = qValues.data;
        let maxIdx = 0;
        for(let i=1; i<data.length; i++) {
            if (data[i] > data[maxIdx]) maxIdx = i;
        }
        return maxIdx;
    }

    learn(obs, action, reward, nextObs, done) {
        // Store experience
        this.memory.push({ obs, action, reward, nextObs, done });
        if (this.memory.length > this.config.memorySize) {
            this.memory.shift();
        }

        // Decay epsilon
        if (done && this.config.epsilon > this.config.epsilonMin) {
            this.config.epsilon *= this.config.epsilonDecay;
        }

        this.steps++;
        if (this.steps % this.config.targetUpdate === 0) {
            this._updateTargetNetwork();
        }

        // Train if enough samples
        if (this.memory.length >= this.config.batchSize) {
            this._trainStep();
        }
    }

    _trainStep() {
        // Sample batch
        const indices = [];
        for(let i=0; i<this.config.batchSize; i++) {
            indices.push(Math.floor(Math.random() * this.memory.length));
        }
        const batch = indices.map(i => this.memory[i]);

        const states = new Tensor(batch.flatMap(e => e.obs)).reshape([this.config.batchSize, this.env.observationSpace.shape[0]]);
        const nextStates = new Tensor(batch.flatMap(e => e.nextObs)).reshape([this.config.batchSize, this.env.observationSpace.shape[0]]);
        const actions = batch.map(e => e.action);
        const rewards = batch.map(e => e.reward);
        const dones = batch.map(e => e.done);

        // Compute Target Q
        // Q_target = r + gamma * max(Q_target_net(next_state))
        const nextQ = this._forward(this.targetNet, nextStates); // [batch, action_dim]

        // Find max next Q manually (assuming simplistic tensor lib)
        const maxNextQ = [];
        const nextQData = nextQ.data;
        const actionDim = this.env.actionSpace.n;

        for(let i=0; i<this.config.batchSize; i++) {
            if (dones[i]) {
                maxNextQ.push(0);
            } else {
                let maxVal = -Infinity;
                for(let j=0; j<actionDim; j++) {
                    const val = nextQData[i*actionDim + j];
                    if(val > maxVal) maxVal = val;
                }
                maxNextQ.push(maxVal);
            }
        }

        const targets = [];
        for(let i=0; i<this.config.batchSize; i++) {
            targets.push(rewards[i] + this.config.gamma * maxNextQ[i]);
        }
        // We only want to update the Q-value for the taken action.
        // Loss = MSE(Q(s, a), target)

        // Forward pass
        const currentQ = this._forward(this.qNet, states);

        // Gather Q values for taken actions
        // Since we can't easily gather with gradients in a simple lib, we mask
        // Or we construct a target tensor that matches currentQ but with the target value inserted at action index

        // Let's try to construct the target tensor for MSE
        // target_full[i][a] = target[i] if a == taken_action else currentQ[i][a] (detached)

        // But to backprop through currentQ correctly, we subtract:
        // loss = sum((Q(s)[action] - target)^2)

        // Since the lib is simple, let's manually compute loss tensor
        // We need to select the specific outputs.
        // Assuming we don't have a 'gather' op with grad support:

        let loss = new Tensor([0], { requiresGrad: true });

        // We iterate over batch to accumulate loss. Inefficient but correct for this level of abstraction.
        // currentQ is [batch, actionDim]
        // But _forward returns [batch, actionDim] tensor.
        // We need to access its elements while maintaining the graph.

        // If Tensor library doesn't support indexing with grad, we might need to mask.
        // Mask: 1 at action index, 0 elsewhere.
        // Q_masked = Q * Mask -> Sum over actions -> Q(s, a)

        for(let i=0; i<this.config.batchSize; i++) {
             const a = actions[i];
             const target = targets[i];

             // Create mask
             const maskData = new Array(actionDim).fill(0);
             maskData[a] = 1;
             const mask = new Tensor(maskData); // [actionDim]

             // Extract Q(s, a)
             // currentQ is [batch, actionDim]. We need to slice it?
             // Or rely on _forward output being a single tensor.
             // If we can't slice, we can't easily batch this way without advanced ops.

             // Fallback: Run forward pass for each sample? Too slow.
             // Assume simple tensor operations support broadcasing/masking.

             // Let's implement row access if possible.
             // If currentQ is a large tensor, accessing elements might break grad if not supported.

             // Alternative:
             // Loss = (currentQ - target_tensor)^2 * mask
             // This zeroes out errors for non-taken actions.

             // Construct full target tensor
             // For non-taken actions, target = current_prediction (so error is 0)
             // For taken action, target = computed_target
        }

        // Re-implementing simplified batch training to avoid complex indexing
        // Just accumulate gradients for each sample (simulated batch) or use masking

        // Construct Mask Tensor: [batch, actionDim]
        const maskData = new Array(this.config.batchSize * actionDim).fill(0);
        const targetData = new Array(this.config.batchSize * actionDim).fill(0);
        const currentQData = currentQ.data; // Detached data for filling non-active targets

        for(let i=0; i<this.config.batchSize; i++) {
            const a = actions[i];
            const idx = i * actionDim + a;
            maskData[idx] = 1;

            // Fill target data
            // For taken action: target value
            // For others: doesn't matter if we multiply by mask, but for MSE we want (pred - target) * mask
            // So if mask is 0, term is 0.
            targetData[idx] = targets[i];
        }

        const mask = new Tensor(maskData).reshape([this.config.batchSize, actionDim]);
        const targetTensor = new Tensor(targetData).reshape([this.config.batchSize, actionDim]);

        // We want to minimize: (Q * mask - target * mask)^2
        // = ((Q - target) * mask)^2

        const diff = currentQ.sub(targetTensor).mul(mask);
        loss = diff.pow(2).mean(); // MSE

        // Backward
        this.optimizer.zeroGrad(this.qNet.params);
        loss.backward();
        this.optimizer.step(this.qNet.params);
    }
}
