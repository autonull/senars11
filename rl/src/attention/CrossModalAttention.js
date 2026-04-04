import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { AttentionOps } from './AttentionOps.js';
import { NeuroSymbolicFusion as FusionOps } from './NeuroSymbolicFusion.js';

const DEFAULTS = {
    neuralDim: 64,
    symbolDim: 32,
    attentionDim: 64,
    heads: 4,
    dropout: 0.1
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

export class NeuroSymbolicFusionSystem extends Component {
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
            gated: () => {
                const result = FusionOps.gatedFusion(neural, symbolic);
                this.gate = FusionOps._lastGate;
                return result;
            },
            attention: () => this.attention.multiHeadAttend(neural, symbolic, context),
            concat: () => FusionOps.concatFusion(neural, symbolic),
            add: () => FusionOps.addFusion(neural, symbolic)
        };

        return (fusionMethods[this.config.mode] ?? fusionMethods.gated)();
    }

    gatedFusion(neural, symbolic) {
        const result = FusionOps.gatedFusion(neural, symbolic);
        this.gate = FusionOps._lastGate;
        return result;
    }

    concatFusion(neural, symbolic) {
        return FusionOps.concatFusion(neural, symbolic);
    }

    addFusion(neural, symbolic) {
        return FusionOps.addFusion(neural, symbolic);
    }

    computeGate(neural, symbolic) {
        return FusionOps.signalStrength(neural) / (FusionOps.signalStrength(neural) + FusionOps.signalStrength(symbolic) || 1);
    }

    signalStrength(tensor) {
        return FusionOps.signalStrength(tensor);
    }

    scale(tensor, factor) {
        return FusionOps.scale(tensor, factor);
    }

    add(t1, t2) {
        return FusionOps.add(t1, t2);
    }

    getGate() {
        return this.gate;
    }
}
