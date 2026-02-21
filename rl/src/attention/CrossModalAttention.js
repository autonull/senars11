/**
 * Attention-Based Neuro-Symbolic Integration
 * Cross-modal attention between neural and symbolic representations.
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';

/**
 * Cross-Modal Attention
 * Attends between neural features and symbolic concepts.
 */
export class CrossModalAttention extends Component {
    constructor(config = {}) {
        super({
            neuralDim: config.neuralDim ?? 64,
            symbolDim: config.symbolDim ?? 32,
            attentionDim: config.attentionDim ?? 64,
            heads: config.heads ?? 4,
            dropout: config.dropout ?? 0.1,
            ...config
        });
        
        this.bridge = new TensorLogicBridge();
        this.attentionWeights = null;
    }

    /**
     * Compute cross-modal attention.
     */
    attend(neuralInput, symbolicInput, context = {}) {
        const { returnWeights = false, mask = null } = context;
        
        // Project to attention dimension
        const neuralProj = this.projectNeural(neuralInput);
        const symbolProj = this.projectSymbolic(symbolicInput);
        
        // Compute attention scores
        const scores = this.computeScores(neuralProj, symbolProj);
        
        // Apply mask if provided
        const maskedScores = mask ? this.applyMask(scores, mask) : scores;
        
        // Softmax
        const weights = this.softmax(maskedScores);
        
        // Apply dropout
        const dropped = this.applyDropout(weights);
        
        // Weighted sum
        const output = this.weightedSum(dropped, symbolProj);
        
        if (returnWeights) {
            this.attentionWeights = dropped;
        }
        
        return output;
    }

    projectNeural(input) {
        if (input instanceof SymbolicTensor) {
            input = input.data;
        }
        
        // Simple linear projection (placeholder for learned weights)
        const projected = new Float32Array(this.config.attentionDim);
        const scale = Math.sqrt(this.config.neuralDim / this.config.attentionDim);
        
        for (let i = 0; i < this.config.attentionDim; i++) {
            for (let j = 0; j < Math.min(input.length, this.config.neuralDim); j++) {
                projected[i] += input[j] * scale / Math.min(input.length, this.config.neuralDim);
            }
        }
        
        return projected;
    }

    projectSymbolic(input) {
        if (input instanceof SymbolicTensor) {
            // Use symbol annotations
            const projected = new Float32Array(this.config.attentionDim);
            
            for (const [key, { symbol, confidence }] of input.symbols) {
                const idx = this.hashSymbol(symbol) % this.config.attentionDim;
                projected[idx] += confidence ?? 1;
            }
            
            return projected;
        }
        
        // Fallback: treat as neural
        return this.projectNeural(input);
    }

    computeScores(query, keys) {
        // Dot-product attention scores
        const scores = new Float32Array(this.config.attentionDim);
        const scale = 1 / Math.sqrt(this.config.attentionDim);
        
        for (let i = 0; i < this.config.attentionDim; i++) {
            scores[i] = query[i] * keys[i] * scale;
        }
        
        return scores;
    }

    applyMask(scores, mask) {
        const masked = new Float32Array(scores);
        for (let i = 0; i < masked.length; i++) {
            if (mask[i] === 0) {
                masked[i] = -Infinity;
            }
        }
        return masked;
    }

    softmax(scores) {
        const maxScore = Math.max(...scores, -Infinity);
        const expScores = scores.map(s => Math.exp(s - maxScore));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        
        return expScores.map(e => e / (sumExp || 1));
    }

    applyDropout(weights) {
        if (this.config.dropout <= 0) return weights;
        
        return weights.map(w => {
            if (Math.random() < this.config.dropout) return 0;
            return w / (1 - this.config.dropout);
        });
    }

    weightedSum(weights, values) {
        const output = new Float32Array(values.length);
        
        for (let i = 0; i < values.length; i++) {
            output[i] = weights[i % weights.length] * values[i];
        }
        
        return new SymbolicTensor(output, [output.length]);
    }

    hashSymbol(symbol) {
        let hash = 0;
        for (let i = 0; i < symbol.length; i++) {
            hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    /**
     * Multi-head attention.
     */
    multiHeadAttend(neuralInput, symbolicInput, context = {}) {
        const headDim = Math.floor(this.config.attentionDim / this.config.heads);
        const outputs = [];
        
        for (let h = 0; h < this.config.heads; h++) {
            const headContext = {
                ...context,
                head: h,
                headDim
            };
            
            // Slice inputs for this head
            const neuralSlice = neuralInput.data?.slice(h * headDim, (h + 1) * headDim) ?? neuralInput;
            const symbolSlice = symbolicInput.data?.slice(h * headDim, (h + 1) * headDim) ?? symbolicInput;
            
            const headOutput = this.attend(neuralSlice, symbolSlice, headContext);
            outputs.push(headOutput);
        }
        
        // Concatenate heads
        return this.concatHeads(outputs);
    }

    concatHeads(outputs) {
        const totalDim = outputs.reduce((sum, o) => sum + o.data.length, 0);
        const concatenated = new Float32Array(totalDim);
        
        let offset = 0;
        for (const output of outputs) {
            concatenated.set(output.data, offset);
            offset += output.data.length;
        }
        
        return new SymbolicTensor(concatenated, [totalDim]);
    }

    /**
     * Self-attention for symbolic tensors.
     */
    symbolicSelfAttention(symbolicInput, context = {}) {
        return this.attend(symbolicInput, symbolicInput, context);
    }

    /**
     * Get attention weights for visualization.
     */
    getAttentionWeights() {
        return this.attentionWeights;
    }

    /**
     * Get attended symbols.
     */
    getAttendedSymbols(symbolicInput, threshold = 0.1) {
        if (!this.attentionWeights) return [];
        
        const attended = [];
        for (const [key, { symbol, confidence }] of symbolicInput.symbols) {
            const idx = parseInt(key);
            const weight = this.attentionWeights[idx % this.attentionWeights.length];
            
            if (weight >= threshold) {
                attended.push({ symbol, weight, confidence });
            }
        }
        
        return attended.sort((a, b) => b.weight - a.weight);
    }
}

/**
 * Symbolic Attention Mechanism
 * Attention over symbolic structures.
 */
export class SymbolicAttention extends Component {
    constructor(config = {}) {
        super({
            dim: config.dim ?? 64,
            temperature: config.temperature ?? 1.0,
            ...config
        });
        
        this.attentionDist = null;
    }

    /**
     * Attend over symbolic concepts.
     */
    attend(query, concepts, context = {}) {
        const { temperature = this.config.temperature } = context;
        
        // Compute similarity between query and each concept
        const similarities = concepts.map(concept => 
            this.similarity(query, concept)
        );
        
        // Apply temperature and softmax
        const scaled = similarities.map(s => s / temperature);
        const weights = this.softmax(scaled);
        
        this.attentionDist = weights;
        
        // Weighted combination
        return this.combine(concepts, weights);
    }

    similarity(query, concept) {
        // Cosine similarity
        const qData = query.data ?? query;
        const cData = concept.data ?? concept;
        
        let dot = 0, normQ = 0, normC = 0;
        const len = Math.min(qData.length, cData.length);
        
        for (let i = 0; i < len; i++) {
            dot += qData[i] * cData[i];
            normQ += qData[i] * qData[i];
            normC += cData[i] * cData[i];
        }
        
        return dot / (Math.sqrt(normQ) * Math.sqrt(normC) || 1);
    }

    softmax(scores) {
        const maxScore = Math.max(...scores, -Infinity);
        const expScores = scores.map(s => Math.exp(s - maxScore));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        return expScores.map(e => e / (sumExp || 1));
    }

    combine(concepts, weights) {
        if (concepts[0]?.data) {
            // Tensor concepts
            const dim = concepts[0].data.length;
            const combined = new Float32Array(dim);
            
            for (let i = 0; i < dim; i++) {
                for (let j = 0; j < concepts.length; j++) {
                    combined[i] += weights[j] * (concepts[j].data[i] ?? 0);
                }
            }
            
            return new SymbolicTensor(combined, [dim]);
        }
        
        // Symbolic concepts
        return concepts.map((c, i) => ({ concept: c, weight: weights[i] }));
    }

    /**
     * Sparse attention (top-k).
     */
    sparseAttend(query, concepts, k = 5) {
        const attended = this.attend(query, concepts);
        
        if (Array.isArray(attended)) {
            return attended
                .sort((a, b) => b.weight - a.weight)
                .slice(0, k);
        }
        
        return attended;
    }

    /**
     * Hard attention (argmax).
     */
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

/**
 * Neuro-Symbolic Fusion
 * Combines neural and symbolic information.
 */
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

    /**
     * Fuse neural and symbolic representations.
     */
    fuse(neural, symbolic, context = {}) {
        switch (this.config.mode) {
            case 'gated':
                return this.gatedFusion(neural, symbolic, context);
            case 'attention':
                return this.attentionFusion(neural, symbolic, context);
            case 'concat':
                return this.concatFusion(neural, symbolic);
            case 'add':
                return this.addFusion(neural, symbolic);
            default:
                return this.gatedFusion(neural, symbolic, context);
        }
    }

    gatedFusion(neural, symbolic, context) {
        // Compute gate
        const gate = this.computeGate(neural, symbolic);
        this.gate = gate;
        
        // Weighted combination
        const neuralWeight = gate;
        const symbolWeight = 1 - gate;
        
        const neuralContrib = this.scale(neural, neuralWeight);
        const symbolContrib = this.scale(symbolic, symbolWeight);
        
        return this.add(neuralContrib, symbolContrib);
    }

    attentionFusion(neural, symbolic, context) {
        // Use cross-modal attention
        return this.attention.multiHeadAttend(neural, symbolic, context);
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
        // Simple gating based on signal strength
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
