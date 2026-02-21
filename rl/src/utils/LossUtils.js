/**
 * Loss Utilities
 * Unified utilities for loss computation and gradient operations.
 * Deeply deduplicated from repeated patterns across agents.
 */
import { Tensor } from '@senars/tensor';
import { createActionMask } from './ActionUtils.js';

/**
 * Compute masked log probability
 */
export const maskedLogProb = (logits, actions) => {
    if (!logits || !actions) return new Tensor([0]);
    
    const actionDim = logits.shape?.[1] ?? logits.length;
    const actionsArr = Array.isArray(actions) ? actions : [actions];
    const mask = createActionMask(actionsArr, actionDim);
    
    return logits.softmax().log().mul(new Tensor(mask)).sum(1);
};

/**
 * Compute policy gradient loss
 */
export const policyGradientLoss = (logits, actions, advantages) => {
    const logProbs = maskedLogProb(logits, actions);
    
    if (Array.isArray(advantages)) {
        const advTensor = new Tensor(advantages);
        return logProbs.mul(advTensor).mean().neg();
    }
    
    return logProbs.mul(advantages).neg();
};

/**
 * Compute PPO clipped loss
 */
export const ppoClippedLoss = (oldLogProbs, newLogProbs, advantages, clipRange = 0.2) => {
    const ratio = newLogProbs.sub(oldLogProbs).exp();
    
    const clipped = ratio.clip(1 - clipRange, 1 + clipRange);
    const surr1 = ratio.mul(advantages);
    const surr2 = clipped.mul(advantages);
    
    return Tensor.min(surr1, surr2).mean().neg();
};

/**
 * Compute value loss (MSE)
 */
export const valueLoss = (values, targets) => {
    if (!values || !targets) return new Tensor([0]);
    
    const vArr = Array.isArray(values) ? new Tensor(values) : values;
    const tArr = Array.isArray(targets) ? new Tensor(targets) : targets;
    
    return vArr.sub(tArr).pow(2).mean();
};

/**
 * Compute entropy bonus
 */
export const entropyBonus = (probs) => {
    if (!probs) return new Tensor([0]);
    
    const pArr = Array.isArray(probs) ? new Tensor(probs) : probs;
    const logProbs = pArr.log();
    return pArr.mul(logProbs).sum(1).neg().mean();
};

/**
 * Compute TD error
 */
export const tdError = (reward, value, nextValue, done, gamma = 0.99) => {
    const target = reward + (done ? 0 : gamma * nextValue);
    return target - value;
};

/**
 * Compute GAE (Generalized Advantage Estimation)
 */
export const computeGAE = (rewards, values, dones, gamma = 0.99, lambda = 0.95) => {
    const advantages = [];
    let advantage = 0;
    
    for (let i = rewards.length - 1; i >= 0; i--) {
        const delta = tdError(rewards[i], values[i], values[i + 1] ?? 0, dones[i], gamma);
        advantage = delta + gamma * lambda * (1 - dones[i]) * advantage;
        advantages.unshift(advantage);
    }
    
    return advantages;
};

/**
 * Compute returns from rewards
 */
export const computeReturns = (rewards, dones, gamma = 0.99) => {
    const returns = [];
    let ret = 0;
    
    for (let i = rewards.length - 1; i >= 0; i--) {
        ret = rewards[i] + (dones[i] ? 0 : gamma * ret);
        returns.unshift(ret);
    }
    
    return returns;
};

/**
 * Normalize advantages
 */
export const normalizeAdvantages = (advantages, epsilon = 1e-8) => {
    if (!advantages || advantages.length === 0) return [];
    
    const mean = advantages.reduce((a, b) => a + b, 0) / advantages.length;
    const variance = advantages.reduce((sum, a) => sum + (a - mean) ** 2, 0) / advantages.length;
    const std = Math.sqrt(variance + epsilon);
    
    return advantages.map(a => (a - mean) / std);
};

/**
 * Compute MSE loss
 */
export const mseLoss = (predictions, targets) => {
    const pArr = Array.isArray(predictions) ? new Tensor(predictions) : predictions;
    const tArr = Array.isArray(targets) ? new Tensor(targets) : targets;
    
    return pArr.sub(tArr).pow(2).mean();
};

/**
 * Compute MAE loss
 */
export const maeLoss = (predictions, targets) => {
    const pArr = Array.isArray(predictions) ? new Tensor(predictions) : predictions;
    const tArr = Array.isArray(targets) ? new Tensor(targets) : targets;
    
    return pArr.sub(tArr).abs().mean();
};

/**
 * Compute cross entropy loss
 */
export const crossEntropyLoss = (logits, targets) => {
    const probs = logits.softmax();
    const targetArr = Array.isArray(targets) ? targets : [targets];
    
    let loss = 0;
    for (let i = 0; i < targetArr.length; i++) {
        loss -= Math.log(probs.data?.[i * probs.shape[1] + targetArr[i]] ?? 1e-10);
    }
    
    return loss / targetArr.length;
};

/**
 * Compute binary cross entropy loss
 */
export const binaryCrossEntropyLoss = (predictions, targets, epsilon = 1e-7) => {
    const pArr = Array.isArray(predictions) ? new Tensor(predictions) : predictions;
    const tArr = Array.isArray(targets) ? new Tensor(targets) : targets;
    
    const clipped = pArr.clip(epsilon, 1 - epsilon);
    const loss = tArr.mul(clipped.log())
        .add(new Tensor(1).sub(tArr).mul(new Tensor(1).sub(clipped).log()))
        .neg()
        .mean();
    
    return loss;
};

/**
 * Huber loss (smooth L1)
 */
export const huberLoss = (predictions, targets, delta = 1.0) => {
    const pArr = Array.isArray(predictions) ? new Tensor(predictions) : predictions;
    const tArr = Array.isArray(targets) ? new Tensor(targets) : targets;
    
    const diff = pArr.sub(tArr).abs();
    const quadratic = diff.mul(diff).mul(0.5);
    const linear = diff.sub(delta * 0.5).mul(delta);
    
    const mask = diff.lessThan(delta);
    return quadratic.mul(mask).add(linear.mul(new Tensor(1).sub(mask))).mean();
};

/**
 * Loss utilities namespace
 */
export const LossUtils = {
    maskedLogProb,
    policyGradientLoss,
    ppoClippedLoss,
    valueLoss,
    entropyBonus,
    tdError,
    computeGAE,
    computeReturns,
    normalizeAdvantages,
    mseLoss,
    maeLoss,
    crossEntropyLoss,
    binaryCrossEntropyLoss,
    huberLoss
};

export default LossUtils;
