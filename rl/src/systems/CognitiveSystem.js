/**
 * Unified Cognitive System
 * Leverages core/reason/Reasoner and core/nar/NAR for reasoning
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { Reasoner as CoreReasoner, NAR, TermFactory } from '@senars/nar';

const ATTENTION_DEFAULTS = {
    neuralDim: 64,
    symbolDim: 32,
    attentionDim: 64,
    heads: 4,
    dropout: 0.1,
    temperature: 1.0
};

const REASONING_DEFAULTS = {
    maxNodes: 100,
    learningRate: 0.1,
    minStrength: 0.1,
    maxEdges: 1000,
    // Core NAR integration
    useNAR: true,
    narConfig: {}
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
        input.symbols?.forEach(({ symbol, confidence }, key) => {
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

export class AttentionSystem extends Component {
    constructor(config = {}) {
        super(mergeConfig(ATTENTION_DEFAULTS, config));
        this.bridge = new TensorLogicBridge();
        this.attentionWeights = null;
        this.attentionDist = null;
    }

    attend(neuralInput, symbolicInput, context = {}) {
        const { returnWeights = false, mask = null, temperature = this.config.temperature } = context;

        const neuralProj = this._projectNeural(neuralInput);
        const symbolProj = this._projectSymbolic(symbolicInput);
        const scores = this._computeScores(neuralProj, symbolProj);
        const maskedScores = mask ? AttentionOps.applyMask(scores, mask) : scores;
        const weights = AttentionOps.softmax(maskedScores.map(s => s / temperature));
        const dropped = AttentionOps.applyDropout(weights, this.config.dropout);
        const output = AttentionOps.weightedSum(dropped, symbolProj);

        if (returnWeights) {
            this.attentionWeights = dropped;
        }

        return new SymbolicTensor(output, [output.length]);
    }

    _projectNeural(input) {
        const data = input instanceof SymbolicTensor ? input.data : input;
        return AttentionOps.projectNeural(data, this.config.neuralDim, this.config.attentionDim);
    }

    _projectSymbolic(input) {
        if (input instanceof SymbolicTensor && input.symbols) {
            return AttentionOps.projectSymbolic(input, this.config.attentionDim);
        }
        return this._projectNeural(input);
    }

    _computeScores(query, keys) {
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

        return this._concatHeads(outputs);
    }

    _concatHeads(outputs) {
        const totalDim = outputs.reduce((sum, o) => sum + o.data.length, 0);
        const concatenated = new Float32Array(totalDim);
        let offset = 0;
        outputs.forEach(output => {
            concatenated.set(output.data, offset);
            offset += output.data.length;
        });
        return new SymbolicTensor(concatenated, [totalDim]);
    }

    selfAttention(input, context = {}) {
        return this.attend(input, input, context);
    }

    sparseAttend(query, concepts, k = 5) {
        const attended = this._attendBatch(query, concepts);
        if (Array.isArray(attended)) {
            return attended.sort((a, b) => b.weight - a.weight).slice(0, k);
        }
        return attended;
    }

    _attendBatch(query, concepts) {
        const similarities = concepts.map(concept =>
            AttentionOps.cosineSimilarity(query.data ?? query, concept.data ?? concept)
        );
        const weights = AttentionOps.softmax(similarities.map(s => s / this.config.temperature));
        this.attentionDist = weights;

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

    getAttentionWeights() { return this.attentionWeights; }
    getAttentionDistribution() { return this.attentionDist; }

    getAttendedSymbols(symbolicInput, threshold = 0.1) {
        if (!this.attentionWeights) return [];
        const attended = [];
        symbolicInput.symbols?.forEach(({ symbol, confidence }, key) => {
            const idx = parseInt(key);
            const weight = this.attentionWeights[idx % this.attentionWeights.length];
            if (weight >= threshold) attended.push({ symbol, weight, confidence });
        });
        return attended.sort((a, b) => b.weight - a.weight);
    }
}

export class CausalNode {
    constructor(id, config = {}) {
        this.id = id;
        this.name = config.name ?? id;
        this.type = config.type ?? 'observed';
        this.parents = new Set();
        this.children = new Set();
        this.state = config.state ?? 'unknown';
        this.probability = config.probability ?? 0.5;
        this.intervention = null;
        this.counterfactual = null;
    }

    addParent(p) { this.parents.add(p); return this; }
    addChild(c) { this.children.add(c); return this; }
    intervene(value) { this.intervention = value; this.state = 'intervened'; return this; }
    reset() { this.intervention = null; this.counterfactual = null; this.state = 'unknown'; return this; }

    toJSON() {
        return {
            id: this.id, name: this.name, type: this.type,
            parents: Array.from(this.parents), children: Array.from(this.children),
            state: this.state, probability: this.probability, intervened: this.intervention !== null
        };
    }
}

export class CausalEdge {
    constructor(from, to, config = {}) {
        this.from = from;
        this.to = to;
        this.strength = config.strength ?? 1.0;
        this.confidence = config.confidence ?? 0.5;
        this.observations = config.observations ?? 0;
    }

    update(strength, confidence) {
        this.strength = 0.7 * this.strength + 0.3 * strength;
        this.confidence = Math.min(1, this.confidence + 0.1);
        this.observations++;
        return this;
    }

    toJSON() {
        return { from: this.from, to: this.to, strength: this.strength, confidence: this.confidence, observations: this.observations };
    }
}

export class CausalGraph extends Component {
    constructor(config = {}) {
        super(mergeConfig(REASONING_DEFAULTS, config));
        this.nodes = new Map();
        this.edges = new Map();
        this.observations = [];
    }

    addNode(id, config = {}) {
        if (this.nodes.size >= this.config.maxNodes) this.prune();
        const node = new CausalNode(id, config);
        this.nodes.set(id, node);
        this.emit('nodeAdded', { id, node });
        return node;
    }

    addEdge(from, to, strength = 1.0) {
        const fromNode = this.nodes.get(from);
        const toNode = this.nodes.get(to);
        if (!fromNode || !toNode) throw new Error(`Invalid edge: ${from} -> ${to}`);

        const edgeKey = `${from}->${to}`;
        if (!this.edges.has(edgeKey)) {
            const edge = new CausalEdge(from, to, { strength });
            this.edges.set(edgeKey, edge);
            fromNode.addChild(to);
            toNode.addParent(from);
            this.emit('edgeAdded', { from, to, edge });
        } else {
            this.edges.get(edgeKey).update(strength);
        }
        return this.edges.get(edgeKey);
    }

    removeNode(id) {
        const node = this.nodes.get(id);
        if (!node) return false;

        node.parents.forEach(p => this.nodes.get(p)?.children.delete(id));
        node.children.forEach(c => this.nodes.get(c)?.parents.delete(id));
        this.edges.forEach((edge, key) => { if (edge.from === id || edge.to === id) this.edges.delete(key); });

        this.nodes.delete(id);
        this.emit('nodeRemoved', { id });
        return true;
    }

    removeEdge(from, to) {
        const edgeKey = `${from}->${to}`;
        const edge = this.edges.get(edgeKey);
        if (!edge) return false;

        this.nodes.get(from)?.children.delete(to);
        this.nodes.get(to)?.parents.delete(from);
        this.edges.delete(edgeKey);
        this.emit('edgeRemoved', { from, to });
        return true;
    }

    getNode(id) { return this.nodes.get(id); }
    getEdge(from, to) { return this.edges.get(`${from}->${to}`); }
    getParents(id) { return Array.from(this.nodes.get(id)?.parents ?? []); }
    getChildren(id) { return Array.from(this.nodes.get(id)?.children ?? []); }
    getRoots() { return Array.from(this.nodes.values()).filter(n => n.parents.size === 0).map(n => n.id); }
    getLeaves() { return Array.from(this.nodes.values()).filter(n => n.children.size === 0).map(n => n.id); }

    hasPath(from, to, visited = new Set()) {
        if (from === to) return true;
        if (visited.has(from)) return false;
        visited.add(from);
        return this.getChildren(from).some(child => this.hasPath(child, to, visited));
    }

    computeCausalEffect(nodeId, intervention) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;
        node.intervene(intervention);
        const effects = this._propagateEffect(nodeId, intervention);
        node.reset();
        return effects;
    }

    _propagateEffect(nodeId, value, effects = {}) {
        this.getChildren(nodeId).forEach(childId => {
            const edge = this.getEdge(nodeId, childId);
            if (edge) {
                effects[childId] = value * edge.strength;
                this._propagateEffect(childId, effects[childId], effects);
            }
        });
        return effects;
    }

    observe(nodeId, value) {
        this.observations.push({ nodeId, value, timestamp: Date.now() });
        if (this.observations.length > 1000) this.observations.shift();
        const node = this.nodes.get(nodeId);
        if (node) node.probability = 0.9 * node.probability + 0.1 * value;
    }

    learnStructure(trajectories, options = {}) {
        const { minStrength = this.config.minStrength } = options;
        const correlations = this._computeCorrelations(trajectories);

        correlations.forEach(({ from, to, strength }) => {
            if (strength >= minStrength) {
                if (!this.nodes.has(from)) this.addNode(from);
                if (!this.nodes.has(to)) this.addNode(to);
                this.addEdge(from, to, strength);
            }
        });
    }

    _computeCorrelations(trajectories) {
        const correlations = new Map();
        trajectories.forEach(traj => {
            const states = traj.states ?? [];
            for (let i = 0; i < states.length - 1; i++) {
                const vars1 = this._extractVariables(states[i]);
                const vars2 = this._extractVariables(states[i + 1]);
                Object.entries(vars1).forEach(([v1, val1]) => {
                    Object.entries(vars2).forEach(([v2, val2]) => {
                        const key = `${v1}->${v2}`;
                        if (!correlations.has(key)) correlations.set(key, { from: v1, to: v2, values: [] });
                        correlations.get(key).values.push([val1, val2]);
                    });
                });
            }
        });

        return Array.from(correlations.values()).map(({ from, to, values }) => ({
            from, to, strength: this._pearsonCorrelation(values)
        }));
    }

    _extractVariables(state) {
        if (Array.isArray(state)) return Object.fromEntries(state.map((v, i) => [`var_${i}`, v]));
        if (typeof state === 'object') return state;
        return { value: state };
    }

    _pearsonCorrelation(pairs) {
        if (pairs.length < 2) return 0;
        const n = pairs.length;
        const x = pairs.map(p => p[0]);
        const y = pairs.map(p => p[1]);
        const meanX = x.reduce((a, b) => a + b, 0) / n;
        const meanY = y.reduce((a, b) => a + b, 0) / n;

        let num = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - meanX;
            const dy = y[i] - meanY;
            num += dx * dy;
            denX += dx * dx;
            denY += dy * dy;
        }
        return num / (Math.sqrt(denX) * Math.sqrt(denY) || 0);
    }

    prune() {
        const leaves = this.getLeaves();
        if (leaves.length > 0) this.removeNode(leaves[0]);
    }

    toJSON() {
        return {
            nodes: Array.from(this.nodes.values()).map(n => n.toJSON()),
            edges: Array.from(this.edges.values()).map(e => e.toJSON())
        };
    }

    static fromJSON(json) {
        const graph = new CausalGraph();
        json.nodes.forEach(n => graph.addNode(n.id, n));
        json.edges.forEach(e => graph.addEdge(e.from, e.to, e.strength));
        return graph;
    }
}

export class ReasoningSystem extends Component {
    constructor(config = {}) {
        super(mergeConfig(REASONING_DEFAULTS, config));
        this.graph = config.graph ?? new CausalGraph(config);
        this.beliefs = new Map();
        
        // Optional core NAR integration for formal reasoning
        this.nar = this.config.useNAR ? new NAR(this.config.narConfig) : null;
        this.termFactory = this.nar?.termFactory ?? new TermFactory();
    }

    async initialize() {
        await this.graph.initialize();
        await this.nar?.start();
        this.emit('initialized', { 
            nodes: this.graph.nodes.size, 
            edges: this.graph.edges.size,
            narEnabled: !!this.nar
        });
    }

    async learn(cause, effect, context = {}) {
        const { action, reward } = context;
        if (!this.graph.nodes.has(cause)) this.graph.addNode(cause);
        if (!this.graph.nodes.has(effect)) this.graph.addNode(effect);

        const strength = reward > 0 ? 0.8 : 0.3;
        this.graph.addEdge(cause, effect, strength);
        this.graph.observe(cause, 1);
        this.graph.observe(effect, reward);

        this.beliefs.set(`${cause}->${effect}`, { cause, effect, action, reward, confidence: 0.5, timestamp: Date.now() });
        
        // Also learn in NAR if enabled
        if (this.nar) {
            const narsese = `<${cause} --> ${effect}>.`;
            this.nar.input(narsese);
        }
    }

    /**
     * Query using NAR reasoning if enabled, otherwise use causal graph
     */
    async reason(question, options = {}) {
        const { cycles = 50 } = options;
        
        if (this.nar) {
            // Use NAR for formal reasoning
            const result = await this.nar.ask(question, { cycles });
            return {
                answer: result,
                source: 'NAR',
                confidence: result?.truth?.confidence ?? 0
            };
        }
        
        // Fallback to causal graph reasoning
        return this.queryCauses(question);
    }

    queryCauses(effect) {
        const effectNode = this.graph.nodes.get(effect);
        if (!effectNode) return [];

        return Array.from(effectNode.parents).map(parentId => {
            const edge = this.graph.getEdge(parentId, effect);
            const belief = this.beliefs.get(`${parentId}->${effect}`);
            return { cause: parentId, strength: edge?.strength ?? 0, confidence: belief?.confidence ?? 0.5 };
        });
    }

    queryEffects(cause) {
        const causeNode = this.graph.nodes.get(cause);
        if (!causeNode) return [];
        return Array.from(causeNode.children).map(childId => ({ effect: childId, strength: this.graph.getEdge(cause, childId)?.strength ?? 0 }));
    }

    intervene(cause, value) {
        return this.graph.computeCausalEffect(cause, value);
    }

    explain(effect, options = {}) {
        const causes = this.queryCauses(effect);
        const { minConfidence = 0.3 } = options;
        return causes
            .filter(c => c.confidence >= minConfidence)
            .sort((a, b) => b.strength - a.strength)
            .map(c => ({ explanation: `${c.cause} causes ${effect} (strength: ${c.strength.toFixed(2)}, confidence: ${c.confidence.toFixed(2)})`, cause: c.cause, strength: c.strength, confidence: c.confidence }));
    }

    getGraph() { return this.graph; }
    getState() { 
        return { 
            nodes: this.graph.nodes.size, 
            edges: this.graph.edges.size, 
            beliefs: this.beliefs.size,
            narEnabled: !!this.nar
        }; 
    }

    async shutdown() {
        await this.graph.shutdown();
        await this.nar?.stop();
        this.beliefs.clear();
    }
}

export { ReasoningSystem as CausalReasoner };
export class CognitiveSystem extends Component {
    constructor(config = {}) {
        super(config);
        this.attention = new AttentionSystem(config.attention ?? {});
        this.reasoning = new ReasoningSystem(config.reasoning ?? {});
        this.fusionMode = config.fusionMode ?? 'gated';
        this.gate = null;
    }

    async initialize() {
        await this.attention.initialize();
        await this.reasoning.initialize();
        this.emit('initialized', { attention: true, reasoning: true });
    }

    process(neuralInput, symbolicInput, context = {}) {
        const attended = this.attention.attend(neuralInput, symbolicInput, context);
        return { attended, symbolic: symbolicInput, neural: neuralInput };
    }

    fuse(neural, symbolic, context = {}) {
        const methods = {
            gated: () => this._gatedFusion(neural, symbolic),
            attention: () => this.attention.multiHeadAttend(neural, symbolic, context),
            concat: () => this._concatFusion(neural, symbolic),
            add: () => this._addFusion(neural, symbolic)
        };
        return (methods[this.fusionMode] ?? methods.gated)();
    }

    _gatedFusion(neural, symbolic) {
        const nStrength = this._signalStrength(neural);
        const sStrength = this._signalStrength(symbolic);
        this.gate = nStrength / (nStrength + sStrength || 1);

        const neuralContrib = this._scale(neural, this.gate);
        const symbolContrib = this._scale(symbolic, 1 - this.gate);
        return this._add(neuralContrib, symbolContrib);
    }

    _concatFusion(neural, symbolic) {
        const nData = neural.data ?? neural;
        const sData = symbolic.data ?? symbolic;
        const concatenated = new Float32Array(nData.length + sData.length);
        concatenated.set(nData, 0);
        concatenated.set(sData, nData.length);
        return new SymbolicTensor(concatenated, [concatenated.length]);
    }

    _addFusion(neural, symbolic) {
        const nData = neural.data ?? neural;
        const sData = symbolic.data ?? symbolic;
        const len = Math.min(nData.length, sData.length);
        const added = new Float32Array(len);
        for (let i = 0; i < len; i++) added[i] = nData[i] + sData[i];
        return new SymbolicTensor(added, [len]);
    }

    _signalStrength(tensor) {
        const data = tensor.data ?? tensor;
        return data.reduce((sum, v) => sum + Math.abs(v), 0) / data.length;
    }

    _scale(tensor, factor) {
        const data = tensor.data ?? tensor;
        const scaled = new Float32Array(data.map(v => v * factor));
        if (tensor instanceof SymbolicTensor) {
            const result = tensor.clone();
            result.data = scaled;
            return result;
        }
        return new SymbolicTensor(scaled, tensor.shape ?? [scaled.length]);
    }

    _add(t1, t2) {
        const d1 = t1.data ?? t1;
        const d2 = t2.data ?? t2;
        const len = Math.min(d1.length, d2.length);
        const added = new Float32Array(len);
        for (let i = 0; i < len; i++) added[i] = d1[i] + d2[i];
        return new SymbolicTensor(added, [len]);
    }

    getGate() { return this.gate; }
    async shutdown() {
        await this.attention.shutdown();
        await this.reasoning.shutdown();
    }
}
