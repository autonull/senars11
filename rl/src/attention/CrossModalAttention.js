import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    neuralDim: 64,
    symbolDim: 32,
    attentionDim: 64,
    heads: 4,
    dropout: 0.1
};

const AttentionOps = {
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

        input.symbols.forEach(({ symbol, confidence }, key) => {
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

    softmax(scores) {
        const maxScore = Math.max(...scores, -Infinity);
        const expScores = scores.map(s => Math.exp(s - maxScore));
        const sumExp = expScores.reduce((a, b) => a + b, 0) || 1;
        return expScores.map(e => e / sumExp);
    },

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

    cosineSimilarity(a, b) {
        let dot = 0, normA = 0, normB = 0;
        const len = Math.min(a.length, b.length);

        for (let i = 0; i < len; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }
};

export class CrossModalAttention extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
        this.bridge = new TensorLogicBridge();
        this.attentionWeights = null;
    }

    attend(neuralInput, symbolicInput, context = {}) {
        const { returnWeights = false, mask = null } = context;

        const neuralProj = this.projectNeural(neuralInput);
        const symbolProj = this.projectSymbolic(symbolicInput);
        const scores = this.computeScores(neuralProj, symbolProj);
        const maskedScores = mask ? AttentionOps.applyMask(scores, mask) : scores;
        const weights = AttentionOps.softmax(maskedScores);
        const dropped = AttentionOps.applyDropout(weights, this.config.dropout);
        const output = AttentionOps.weightedSum(dropped, symbolProj);

        if (returnWeights) {
            this.attentionWeights = dropped;
        }

        return new SymbolicTensor(output, [output.length]);
    }

    projectNeural(input) {
        const data = input instanceof SymbolicTensor ? input.data : input;
        return AttentionOps.projectNeural(data, this.config.neuralDim, this.config.attentionDim);
    }

    projectSymbolic(input) {
        if (input instanceof SymbolicTensor) {
            return AttentionOps.projectSymbolic(input, this.config.attentionDim);
        }
        return this.projectNeural(input);
    }

    computeScores(query, keys) {
        const scale = 1 / Math.sqrt(this.config.attentionDim);
        return AttentionOps.computeScores(query, keys, scale);
    }

    multiHeadAttend(neuralInput, symbolicInput, context = {}) {
        const headDim = Math.floor(this.config.attentionDim / this.config.heads);
        const outputs = [];

        for (let h = 0; h < this.config.heads; h++) {
            const neuralSlice = neuralInput.data?.slice(h * headDim, (h + 1) * headDim) ?? neuralInput;
            const symbolSlice = symbolicInput.data?.slice(h * headDim, (h + 1) * headDim) ?? symbolicInput;
            outputs.push(this.attend(neuralSlice, symbolSlice, { ...context, head: h }));
        }

        return this.concatHeads(outputs);
    }

    concatHeads(outputs) {
        const totalDim = outputs.reduce((sum, o) => sum + o.data.length, 0);
        const concatenated = new Float32Array(totalDim);

        let offset = 0;
        outputs.forEach(output => {
            concatenated.set(output.data, offset);
            offset += output.data.length;
        });

        return new SymbolicTensor(concatenated, [totalDim]);
    }

    symbolicSelfAttention(symbolicInput, context = {}) {
        return this.attend(symbolicInput, symbolicInput, context);
    }

    getAttentionWeights() {
        return this.attentionWeights;
    }

    getAttendedSymbols(symbolicInput, threshold = 0.1) {
        if (!this.attentionWeights) return [];

        const attended = [];
        symbolicInput.symbols.forEach(({ symbol, confidence }, key) => {
            const idx = parseInt(key);
            const weight = this.attentionWeights[idx % this.attentionWeights.length];

            if (weight >= threshold) {
                attended.push({ symbol, weight, confidence });
            }
        });

        return attended.sort((a, b) => b.weight - a.weight);
    }
}

export class SymbolicAttention extends Component {
    constructor(config = {}) {
        super({
            dim: config.dim ?? 64,
            temperature: config.temperature ?? 1.0,
            ...config
        });
        this.attentionDist = null;
    }

    attend(query, concepts, context = {}) {
        const { temperature = this.config.temperature } = context;

        const similarities = concepts.map(concept =>
            AttentionOps.cosineSimilarity(query.data ?? query, concept.data ?? concept)
        );

        const scaled = similarities.map(s => s / temperature);
        const weights = AttentionOps.softmax(scaled);
        this.attentionDist = weights;

        return this.combine(concepts, weights);
    }

    combine(concepts, weights) {
        if (concepts[0]?.data) {
            const dim = concepts[0].data.length;
            const combined = new Float32Array(dim);

            for (let i = 0; i < dim; i++) {
                for (let j = 0; j < concepts.length; j++) {
                    combined[i] += weights[j] * (concepts[j].data[i] ?? 0);
                }
            }

            return new SymbolicTensor(combined, [dim]);
        }

        return concepts.map((c, i) => ({ concept: c, weight: weights[i] }));
    }

    sparseAttend(query, concepts, k = 5) {
        const attended = this.attend(query, concepts);

        if (Array.isArray(attended)) {
            return attended
                .sort((a, b) => b.weight - a.weight)
                .slice(0, k);
        }

        return attended;
    }

    hardAttend(query, concepts) {
        if (!this.attentionDist) {
            this.attend(query, concepts);
        }

        const maxIdx = this.attentionDist.indexOf(Math.max(...this.attentionDist));
        return concepts[maxIdx];
    }

    getAttentionDistribution() {
        return this.attentionDist;
    }
}

export class NeuroSymbolicFusion extends Component {
    constructor(config = {}) {
        super({
            mode: config.mode ?? 'gated',
            neuralWeight: config.neuralWeight ?? 0.5,
            ...config
        });
        this.attention = new CrossModalAttention(config);
        this.gate = null;
    }

    fuse(neural, symbolic, context = {}) {
        const fusionMethods = {
            gated: () => this.gatedFusion(neural, symbolic, context),
            attention: () => this.attention.multiHeadAttend(neural, symbolic, context),
            concat: () => this.concatFusion(neural, symbolic),
            add: () => this.addFusion(neural, symbolic)
        };

        return (fusionMethods[this.config.mode] ?? fusionMethods.gated)();
    }

    gatedFusion(neural, symbolic) {
        const gate = this.computeGate(neural, symbolic);
        this.gate = gate;

        const neuralContrib = this.scale(neural, gate);
        const symbolContrib = this.scale(symbolic, 1 - gate);

        return this.add(neuralContrib, symbolContrib);
    }

    concatFusion(neural, symbolic) {
        const nData = neural.data ?? neural;
        const sData = symbolic.data ?? symbolic;

        const concatenated = new Float32Array(nData.length + sData.length);
        concatenated.set(nData, 0);
        concatenated.set(sData, nData.length);

        return new SymbolicTensor(concatenated, [concatenated.length]);
    }

    addFusion(neural, symbolic) {
        const nData = neural.data ?? neural;
        const sData = symbolic.data ?? symbolic;
        const len = Math.min(nData.length, sData.length);

        const added = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            added[i] = nData[i] + sData[i];
        }

        return new SymbolicTensor(added, [len]);
    }

    computeGate(neural, symbolic) {
        const nStrength = this.signalStrength(neural);
        const sStrength = this.signalStrength(symbolic);
        return nStrength / (nStrength + sStrength || 1);
    }

    signalStrength(tensor) {
        const data = tensor.data ?? tensor;
        return data.reduce((sum, v) => sum + Math.abs(v), 0) / data.length;
    }

    scale(tensor, factor) {
        const data = tensor.data ?? tensor;
        const scaled = new Float32Array(data.length);

        for (let i = 0; i < data.length; i++) {
            scaled[i] = data[i] * factor;
        }

        if (tensor instanceof SymbolicTensor) {
            const result = tensor.clone();
            result.data = scaled;
            return result;
        }

        return new SymbolicTensor(scaled, tensor.shape ?? [scaled.length]);
    }

    add(t1, t2) {
        const d1 = t1.data ?? t1;
        const d2 = t2.data ?? t2;
        const len = Math.min(d1.length, d2.length);

        const added = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            added[i] = d1[i] + d2[i];
        }

        return new SymbolicTensor(added, [len]);
    }

    getGate() {
        return this.gate;
    }
}
