/**
 * Model Factory
 * Unified utilities for building neural network models.
 * Deeply deduplicated from identical MLP patterns across agents.
 */
import { Tensor } from '@senars/tensor';

/**
 * Create MLP model with specified layers
 */
export const createMLP = (layers, options = {}) => {
    const {
        requiresGrad = true,
        initStd = 0.1,
        bias = true
    } = options;
    
    const params = [];
    const model = {};
    
    for (let i = 0; i < layers.length - 1; i++) {
        const [input, output] = [layers[i], layers[i + 1]];
        const wKey = `w${i}`;
        const bKey = `b${i}`;
        
        model[wKey] = Tensor.randn([output, input], 0, initStd);
        
        if (bias) {
            model[bKey] = Tensor.zeros([output]);
        }
        
        if (requiresGrad) {
            model[wKey].requiresGrad = true;
            if (bias) model[bKey].requiresGrad = true;
        }
        
        params.push(model[wKey]);
        if (bias) params.push(model[bKey]);
    }
    
    return { ...model, params };
};

/**
 * Forward pass through MLP
 */
export const forwardMLP = (model, x, options = {}) => {
    const {
        activation = 'relu',
        outputActivation = null
    } = options;
    
    let h = x.ndim === 1 
        ? x.reshape([x.shape[0], 1]) 
        : x.transpose();
    
    let i = 0;
    let lastOutput = null;
    
    while (true) {
        const wKey = `w${i}`;
        const bKey = `b${i}`;
        
        if (!model[wKey]) break;
        
        const z = model[wKey].matmul(h);
        
        if (model[bKey]) {
            const biasShape = [model[bKey].shape[0], 1];
            lastOutput = z.add(model[bKey].reshape(biasShape));
        } else {
            lastOutput = z;
        }
        
        // Apply activation (not on last layer unless specified)
        const isLastLayer = !model[`w${i + 1}`];
        const useActivation = !isLastLayer || (isLastLayer && outputActivation);
        
        if (useActivation) {
            h = applyActivation(lastOutput, activation);
        } else {
            h = lastOutput;
        }
        
        i++;
    }
    
    const result = x.ndim > 1 ? h.transpose() : h.reshape([h.shape[0]]);
    return result;
};

/**
 * Apply activation function
 */
export const applyActivation = (x, activation) => {
    if (!activation || activation === 'linear') return x;
    
    switch (activation.toLowerCase()) {
        case 'relu':
            return x.relu();
        case 'sigmoid':
            return x.sigmoid();
        case 'tanh':
            return x.tanh();
        case 'softmax':
            return x.softmax();
        default:
            return x;
    }
};

/**
 * Create CNN model
 */
export const createCNN = (config, options = {}) => {
    const {
        inputShape,
        channels,
        kernelSizes,
        strides,
        denseLayers,
        requiresGrad = true,
        initStd = 0.1
    } = config;
    
    const params = [];
    const model = {};
    
    // Convolutional layers
    let currentChannels = inputShape[0];
    let currentSize = inputShape.slice(1);
    
    for (let i = 0; i < channels.length; i++) {
        const outChannels = channels[i];
        const kernelSize = kernelSizes?.[i] ?? 3;
        const stride = strides?.[i] ?? 1;
        
        const wKey = `conv${i}`;
        const bKey = `conv${i}_b`;
        
        model[wKey] = Tensor.randn(
            [outChannels, currentChannels, kernelSize, kernelSize],
            0,
            initStd
        );
        model[bKey] = Tensor.zeros([outChannels]);
        
        if (requiresGrad) {
            model[wKey].requiresGrad = true;
            model[bKey].requiresGrad = true;
        }
        
        params.push(model[wKey], model[bKey]);
        
        currentChannels = outChannels;
        currentSize = currentSize.map(s => Math.floor((s - kernelSize) / stride + 1));
    }
    
    // Dense layers
    const flatSize = currentChannels * currentSize.reduce((a, b) => a * b, 1);
    const allDenseLayers = [flatSize, ...denseLayers];
    
    for (let i = 0; i < allDenseLayers.length - 1; i++) {
        const wKey = `dense${i}`;
        const bKey = `dense${i}_b`;
        
        model[wKey] = Tensor.randn(
            [allDenseLayers[i + 1], allDenseLayers[i]],
            0,
            initStd
        );
        model[bKey] = Tensor.zeros([allDenseLayers[i + 1]]);
        
        if (requiresGrad) {
            model[wKey].requiresGrad = true;
            model[bKey].requiresGrad = true;
        }
        
        params.push(model[wKey], model[bKey]);
    }
    
    return { ...model, params, config };
};

/**
 * Create LSTM/RNN model
 */
export const createRNN = (config, options = {}) => {
    const {
        inputDim,
        hiddenDim,
        outputDim,
        numLayers = 1,
        requiresGrad = true,
        initStd = 0.1
    } = config;
    
    const params = [];
    const model = {};
    
    // LSTM gates for each layer
    for (let layer = 0; layer < numLayers; layer++) {
        const inDim = layer === 0 ? inputDim : hiddenDim;
        const outDim = hiddenDim;
        
        // LSTM has 4 gates: input, forget, cell, output
        for (const gate of ['i', 'f', 'c', 'o']) {
            const wKey = `lstm${layer}_${gate}_w`;
            const uKey = `lstm${layer}_${gate}_u`;
            const bKey = `lstm${layer}_${gate}_b`;
            
            model[wKey] = Tensor.randn([outDim, inDim], 0, initStd);
            model[uKey] = Tensor.randn([outDim, outDim], 0, initStd);
            model[bKey] = Tensor.zeros([outDim]);
            
            if (requiresGrad) {
                model[wKey].requiresGrad = true;
                model[uKey].requiresGrad = true;
                model[bKey].requiresGrad = true;
            }
            
            params.push(model[wKey], model[uKey], model[bKey]);
        }
    }
    
    // Output layer
    model.out_w = Tensor.randn([outputDim, hiddenDim], 0, initStd);
    model.out_b = Tensor.zeros([outputDim]);
    
    if (requiresGrad) {
        model.out_w.requiresGrad = true;
        model.out_b.requiresGrad = true;
    }
    
    params.push(model.out_w, model.out_b);
    
    return { ...model, params, config };
};

/**
 * Count parameters in model
 */
export const countParams = (model) => {
    if (!model || !model.params) return 0;
    return model.params.reduce((sum, p) => sum + (p.data?.length ?? 0), 0);
};

/**
 * Get model state dict
 */
export const getStateDict = (model) => {
    const state = {};
    for (const [key, value] of Object.entries(model)) {
        if (key !== 'params' && key !== 'config' && value?.data) {
            state[key] = {
                data: Array.from(value.data),
                shape: value.shape,
                requiresGrad: value.requiresGrad
            };
        }
    }
    return state;
};

/**
 * Load model from state dict
 */
export const loadStateDict = (model, state) => {
    for (const [key, stateData] of Object.entries(state)) {
        if (model[key]) {
            model[key].data = new Float32Array(stateData.data);
            model[key].shape = stateData.shape;
            model[key].requiresGrad = stateData.requiresGrad;
        }
    }
    return model;
};

/**
 * Clone model
 */
export const cloneModel = (model) => {
    const cloned = {};
    for (const [key, value] of Object.entries(model)) {
        if (key === 'params') {
            cloned.params = model.params.map(p => p.clone());
        } else if (value?.data) {
            cloned[key] = value.clone();
        } else {
            cloned[key] = value;
        }
    }
    return cloned;
};

/**
 * Model utilities namespace
 */
export const ModelUtils = {
    createMLP,
    forwardMLP,
    applyActivation,
    createCNN,
    createRNN,
    countParams,
    getStateDict,
    loadStateDict,
    cloneModel
};

export default ModelUtils;
