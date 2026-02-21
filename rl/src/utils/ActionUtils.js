/**
 * Action Utilities
 * Unified utilities for action selection, sampling, and manipulation.
 * Deeply deduplicated from 38+ occurrences across the codebase.
 */
import { Tensor } from '@senars/tensor';

/**
 * Get index of maximum value
 */
export const argmax = (arr) => {
    if (!arr || arr.length === 0) return 0;
    if (arr.data) return argmax(Array.from(arr.data));
    
    let maxIdx = 0;
    let maxVal = arr[0];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] > maxVal) {
            maxVal = arr[i];
            maxIdx = i;
        }
    }
    return maxIdx;
};

/**
 * Generate random integer in [0, n)
 */
export const randomInt = (n) => Math.floor(Math.random() * n);

/**
 * Sample from discrete probability distribution
 */
export const sampleDiscrete = (probs) => {
    if (!probs || probs.length === 0) return 0;
    if (probs.data) return sampleDiscrete(Array.from(probs.data));
    
    const r = Math.random();
    let cumsum = 0;
    for (let i = 0; i < probs.length; i++) {
        cumsum += probs[i];
        if (r <= cumsum) return i;
    }
    return probs.length - 1;
};

/**
 * Softmax sampling with temperature
 */
export const softmaxSample = (logits, temperature = 1.0) => {
    if (!logits || logits.length === 0) return 0;
    if (logits.data) return softmaxSample(Array.from(logits.data), temperature);
    
    const scaled = logits.map(l => l / temperature);
    const maxLogit = Math.max(...scaled);
    const exp = scaled.map(l => Math.exp(l - maxLogit));
    const sum = exp.reduce((a, b) => a + b, 0);
    const probs = exp.map(e => e / (sum || 1));
    
    return sampleDiscrete(probs);
};

/**
 * Random action from action space
 */
export const randomAction = (actionSpace) => {
    if (!actionSpace) return 0;
    
    if (actionSpace.type === 'Discrete') {
        return randomInt(actionSpace.n);
    }
    
    if (actionSpace.type === 'Box' || actionSpace.type === 'Hybrid') {
        const low = actionSpace.low ?? -1;
        const high = actionSpace.high ?? 1;
        const shape = actionSpace.shape ?? [1];
        const size = shape.reduce((a, b) => a * b, 1);
        
        if (Array.isArray(low)) {
            return low.map((l, i) => {
                const h = Array.isArray(high) ? high[i] : high;
                return l + Math.random() * (h - l);
            });
        }
        
        const result = Array.from({ length: size }, () =>
            low + Math.random() * (high - low)
        );
        
        return shape.length <= 1 ? result[0] : result;
    }
    
    return 0;
};

/**
 * Create one-hot mask for actions
 */
export const createActionMask = (actions, actionDim) => {
    const mask = new Array(actions.length * actionDim).fill(0);
    for (let i = 0; i < actions.length; i++) {
        mask[i * actionDim + actions[i]] = 1;
    }
    return mask;
};

/**
 * Create tensor mask for actions
 */
export const createActionTensor = (actions, actionDim) => {
    const maskData = createActionMask(actions, actionDim);
    return new Tensor(maskData, { shape: [actions.length, actionDim] });
};

/**
 * Compute log probabilities from logits
 */
export const logProbFromLogits = (logits, actions) => {
    if (!logits || !actions) return new Tensor([0]);
    
    const actionDim = logits.shape?.[1] ?? logits.length;
    const mask = createActionTensor(
        Array.isArray(actions) ? actions : [actions],
        actionDim
    );
    
    const logProbs = logits.softmax().log().mul(mask);
    return logProbs.sum(1);
};

/**
 * Epsilon-greedy action selection
 */
export const epsilonGreedy = (actionValues, epsilon, actionSpace) => {
    if (Math.random() < epsilon) {
        return randomAction(actionSpace ?? { type: 'Discrete', n: actionValues.length });
    }
    return argmax(actionValues);
};

/**
 * Clip action to space bounds
 */
export const clipAction = (action, actionSpace) => {
    if (!actionSpace || actionSpace.type === 'Discrete') {
        return action;
    }
    
    const low = actionSpace.low ?? -1;
    const high = actionSpace.high ?? 1;
    
    if (Array.isArray(action)) {
        if (Array.isArray(low)) {
            return action.map((v, i) => {
                const l = Array.isArray(low) ? low[i] : low;
                const h = Array.isArray(high) ? high[i] : high;
                return Math.max(l, Math.min(h, v));
            });
        }
        return action.map(v => Math.max(low, Math.min(high, v)));
    }
    
    return Math.max(low, Math.min(high, action));
};

/**
 * Scale action from one range to another
 */
export const scaleAction = (action, fromRange, toRange) => {
    const [fromLow, fromHigh] = fromRange;
    const [toLow, toHigh] = toRange;
    
    if (Array.isArray(action)) {
        return action.map(v => {
            const normalized = (v - fromLow) / (fromHigh - fromLow);
            return toLow + normalized * (toHigh - toLow);
        });
    }
    
    const normalized = (action - fromLow) / (fromHigh - fromLow);
    return toLow + normalized * (toHigh - toLow);
};

/**
 * Action space utilities
 */
export const ActionSpaceUtils = {
    /**
     * Get flat dimension for action space
     */
    getFlatDim: (actionSpace) => {
        if (!actionSpace) return 0;
        
        if (actionSpace.type === 'Discrete') {
            return actionSpace.n;
        }
        
        if (actionSpace.type === 'Box') {
            return actionSpace.shape?.reduce((a, b) => a * b, 1) ?? 1;
        }
        
        if (actionSpace.type === 'Hybrid') {
            let dim = 0;
            for (const spec of Object.values(actionSpace.discrete ?? {})) {
                dim += spec.n;
            }
            for (const spec of Object.values(actionSpace.continuous ?? {})) {
                dim += spec.shape?.reduce((a, b) => a * b, 1) ?? 1;
            }
            return dim;
        }
        
        return 0;
    },

    /**
     * Sample from action space
     */
    sample: (actionSpace) => {
        if (!actionSpace) return 0;
        return randomAction(actionSpace);
    },

    /**
     * Check if action is valid
     */
    contains: (actionSpace, action) => {
        if (!actionSpace) return false;
        
        if (actionSpace.type === 'Discrete') {
            return Number.isInteger(action) && action >= 0 && action < actionSpace.n;
        }
        
        if (actionSpace.type === 'Box') {
            const low = actionSpace.low ?? -Infinity;
            const high = actionSpace.high ?? Infinity;
            
            if (Array.isArray(action)) {
                if (Array.isArray(low)) {
                    return action.every((v, i) => v >= low[i] && v <= (Array.isArray(high) ? high[i] : high));
                }
                return action.every(v => v >= low && v <= high);
            }
            
            return action >= low && action <= high;
        }
        
        return false;
    }
};

/**
 * Default export with all utilities
 */
export const ActionUtils = {
    argmax,
    randomInt,
    sampleDiscrete,
    softmaxSample,
    randomAction,
    createActionMask,
    createActionTensor,
    logProbFromLogits,
    epsilonGreedy,
    clipAction,
    scaleAction,
    ...ActionSpaceUtils
};

export default ActionUtils;
