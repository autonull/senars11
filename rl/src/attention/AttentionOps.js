import { cosineSimilarity, softmax } from '@senars/core';

export const AttentionOps = {
    projectNeural(input, fromDim, toDim) {
        const projected = new Float32Array(toDim);
        const scale = Math.sqrt(fromDim / toDim);
        const len = Math.min(input.length, fromDim);
        for (let i = 0; i < toDim; i++) {
            for (let j = 0; j < len; j++) {
                projected[i] += input[j] * scale / len;
            }
        }
        return projected;
    },

    projectSymbolic(input, attentionDim) {
        const projected = new Float32Array(attentionDim);
        input.symbols?.forEach(({ symbol, confidence }) => {
            const idx = this.hashSymbol(symbol) % attentionDim;
            projected[idx] += confidence ?? 1;
        });
        return projected;
    },

    computeScores(query, keys, scale) {
        return keys.map((k, i) => query[i] * k * scale);
    },

    applyMask(scores, mask) {
        return scores.map((s, i) => mask[i] === 0 ? -Infinity : s);
    },

    softmax: (scores) => softmax(scores),

    applyDropout(weights, dropout) {
        if (dropout <= 0) return weights;
        return weights.map(w => Math.random() < dropout ? 0 : w / (1 - dropout));
    },

    weightedSum(weights, values) {
        const output = new Float32Array(values.length);
        for (let i = 0; i < values.length; i++) {
            output[i] = weights[i % weights.length] * values[i];
        }
        return output;
    },

    hashSymbol(symbol) {
        let hash = 0;
        for (let i = 0; i < symbol.length; i++) {
            hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    },

    cosineSimilarity: (a, b) => cosineSimilarity(a, b)
};
