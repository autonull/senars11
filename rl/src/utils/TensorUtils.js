/**
 * Tensor Utilities
 * Common tensor operations and helpers.
 */

export const TensorUtils = {
    normalize: (tensor, epsilon = 1e-8) => {
        const min = Math.min(...tensor.data);
        const max = Math.max(...tensor.data);
        const range = max - min + epsilon;
        const normalized = tensor.map(x => (x - min) / range);
        return normalized;
    },

    standardize: (tensor) => {
        const data = Array.from(tensor.data);
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
        const std = Math.sqrt(variance + 1e-8);
        const standardized = tensor.map(x => (x - mean) / std);
        return standardized;
    },

    clip: (tensor, min, max) => {
        return tensor.map(x => Math.max(min, Math.min(max, x)));
    },

    softmax: (tensor, temperature = 1.0) => {
        const data = Array.from(tensor.data);
        const scaled = data.map(x => x / temperature);
        const maxVal = Math.max(...scaled);
        const exp = scaled.map(x => Math.exp(x - maxVal));
        const sum = exp.reduce((a, b) => a + b, 0);
        return tensor.map(x => Math.exp((x - maxVal) / temperature) / sum);
    },

    sigmoid: (tensor) => {
        return tensor.map(x => 1 / (1 + Math.exp(-x)));
    },

    relu: (tensor) => {
        return tensor.map(x => Math.max(0, x));
    },

    tanh: (tensor) => {
        return tensor.map(x => Math.tanh(x));
    },

    oneHot: (index, numClasses) => {
        const result = new Array(numClasses).fill(0);
        result[index] = 1;
        return result;
    },

    argmax: (tensor) => {
        const data = Array.from(tensor.data);
        return data.indexOf(Math.max(...data));
    },

    argmin: (tensor) => {
        const data = Array.from(tensor.data);
        return data.indexOf(Math.min(...data));
    },

    topk: (tensor, k, largest = true) => {
        const data = Array.from(tensor.data).map((v, i) => ({ value: v, index: i }));
        data.sort((a, b) => largest ? b.value - a.value : a.value - b.value);
        return data.slice(0, k);
    },

    sample: (tensor, temperature = 1.0) => {
        const probs = Array.from(tensor.data);
        const scaled = probs.map(p => Math.exp(p / temperature));
        const sum = scaled.reduce((a, b) => a + b, 0);
        const normalized = scaled.map(p => p / sum);

        const r = Math.random();
        let cumsum = 0;
        for (let i = 0; i < normalized.length; i++) {
            cumsum += normalized[i];
            if (r <= cumsum) return i;
        }
        return normalized.length - 1;
    },

    reshape: (tensor, newShape) => {
        const totalElements = newShape.reduce((a, b) => a * b, 1);
        if (tensor.data.length !== totalElements) {
            throw new Error(`Cannot reshape: ${tensor.data.length} != ${totalElements}`);
        }
        const result = tensor.clone();
        result.shape = newShape;
        return result;
    },

    transpose: (tensor) => {
        if (tensor.shape.length !== 2) {
            throw new Error('Transpose only supported for 2D tensors');
        }
        const [rows, cols] = tensor.shape;
        const data = new Float32Array(tensor.data.length);
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                data[j * rows + i] = tensor.data[i * cols + j];
            }
        }
        const result = tensor.clone();
        result.data = data;
        result.shape = [cols, rows];
        return result;
    },

    dot: (tensor1, tensor2) => {
        const data1 = Array.from(tensor1.data);
        const data2 = Array.from(tensor2.data);
        return data1.reduce((sum, a, i) => sum + a * data2[i], 0);
    },

    outer: (tensor1, tensor2) => {
        const data1 = Array.from(tensor1.data);
        const data2 = Array.from(tensor2.data);
        const result = new Float32Array(data1.length * data2.length);
        for (let i = 0; i < data1.length; i++) {
            for (let j = 0; j < data2.length; j++) {
                result[i * data2.length + j] = data1[i] * data2[j];
            }
        }
        return {
            data: result,
            shape: [tensor1.shape[0] ?? 1, tensor2.shape[0] ?? 1]
        };
    },

    addScalar: (tensor, scalar) => {
        return tensor.map(x => x + scalar);
    },

    mulScalar: (tensor, scalar) => {
        return tensor.map(x => x * scalar);
    },

    l2Norm: (tensor) => {
        const sumSquares = Array.from(tensor.data).reduce((sum, x) => sum + x * x, 0);
        return Math.sqrt(sumSquares);
    },

    l1Norm: (tensor) => {
        return Array.from(tensor.data).reduce((sum, x) => sum + Math.abs(x), 0);
    },

    cosineSimilarity: (tensor1, tensor2) => {
        const dot = TensorUtils.dot(tensor1, tensor2);
        const norm1 = TensorUtils.l2Norm(tensor1);
        const norm2 = TensorUtils.l2Norm(tensor2);
        return dot / (norm1 * norm2 + 1e-8);
    },

    euclideanDistance: (tensor1, tensor2) => {
        const diff = tensor1.sub(tensor2);
        return TensorUtils.l2Norm(diff);
    },

    pad: (tensor, padSize, value = 0) => {
        const [dim] = tensor.shape;
        const newSize = dim + padSize * 2;
        const data = new Float32Array(newSize);
        data.fill(value);
        for (let i = 0; i < dim; i++) {
            data[i + padSize] = tensor.data[i];
        }
        const result = tensor.clone();
        result.data = data;
        result.shape = [newSize];
        return result;
    },

    squeeze: (tensor) => {
        const newShape = tensor.shape.filter(d => d !== 1);
        if (newShape.length === 0) newShape.push(1);
        const result = tensor.clone();
        result.shape = newShape;
        return result;
    },

    unsqueeze: (tensor, axis = 0) => {
        const newShape = [...tensor.shape];
        newShape.splice(axis, 0, 1);
        const result = tensor.clone();
        result.shape = newShape;
        return result;
    },

    concat: (tensors, axis = 0) => {
        if (!tensors.length) return null;
        const data = new Float32Array(
            tensors.reduce((sum, t) => sum + t.data.length, 0)
        );
        let offset = 0;
        tensors.forEach(t => {
            data.set(t.data, offset);
            offset += t.data.length;
        });
        const result = tensors[0].clone();
        result.data = data;
        result.shape[axis] = tensors.reduce((sum, t) => sum + t.shape[axis], 0);
        return result;
    },

    split: (tensor, sizes, axis = 0) => {
        const results = [];
        let offset = 0;
        sizes.forEach(size => {
            const data = tensor.data.slice(offset, offset + size);
            const result = tensor.clone();
            result.data = new Float32Array(data);
            result.shape[axis] = size;
            results.push(result);
            offset += size;
        });
        return results;
    },

    zeros: (shape) => {
        const size = shape.reduce((a, b) => a * b, 1);
        return {
            data: new Float32Array(size),
            shape: [...shape],
            requiresGrad: false
        };
    },

    ones: (shape) => {
        const size = shape.reduce((a, b) => a * b, 1);
        return {
            data: new Float32Array(size).fill(1),
            shape: [...shape],
            requiresGrad: false
        };
    },

    countParams: (model) => {
        if (!model?.params) return 0;
        return model.params.reduce((sum, p) => sum + (p.data?.length ?? 0), 0);
    },

    getStateDict: (model) => {
        const state = {};
        Object.entries(model).forEach(([key, value]) => {
            if (key !== 'params' && key !== 'config' && value?.data) {
                state[key] = {
                    data: Array.from(value.data),
                    shape: value.shape,
                    requiresGrad: value.requiresGrad
                };
            }
        });
        return state;
    },

    loadStateDict: (model, state) => {
        Object.entries(state).forEach(([key, stateData]) => {
            if (model[key]) {
                model[key].data = new Float32Array(stateData.data);
                model[key].shape = stateData.shape;
                model[key].requiresGrad = stateData.requiresGrad;
            }
        });
        return model;
    }
};

export const {
    normalize,
    standardize,
    clip,
    softmax,
    sigmoid,
    relu,
    tanh,
    oneHot,
    argmax,
    argmin,
    topk,
    sample,
    reshape,
    transpose,
    dot,
    outer,
    addScalar,
    mulScalar,
    l2Norm,
    l1Norm,
    cosineSimilarity,
    euclideanDistance,
    pad,
    squeeze,
    unsqueeze,
    concat,
    split,
    zeros,
    ones,
    countParams,
    getStateDict,
    loadStateDict
} = TensorUtils;

export default TensorUtils;
