import { Component } from '../composable/Component.js';
import { SymbolicTensor } from '../neurosymbolic/TensorLogicBridge.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    maxNodes: 100,
    learningRate: 0.1,
    minStrength: 0.1,
    maxEdges: 1000
};

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

    addParent(parent) { this.parents.add(parent); return this; }
    addChild(child) { this.children.add(child); return this; }
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
        super(mergeConfig(DEFAULTS, config));
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

        node.parents.forEach(p => {
            const parent = this.nodes.get(p);
            parent?.children.delete(id);
        });

        node.children.forEach(c => {
            const child = this.nodes.get(c);
            child?.parents.delete(id);
        });

        this.edges.forEach((edge, key) => {
            if (edge.from === id || edge.to === id) this.edges.delete(key);
        });

        this.nodes.delete(id);
        this.emit('nodeRemoved', { id });
        return true;
    }

    removeEdge(from, to) {
        const edgeKey = `${from}->${to}`;
        const edge = this.edges.get(edgeKey);
        if (!edge) return false;

        const fromNode = this.nodes.get(from);
        const toNode = this.nodes.get(to);
        fromNode?.children.delete(to);
        toNode?.parents.delete(from);

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

        const children = this.getChildren(from);
        return children.some(child => this.hasPath(child, to, visited));
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
        const children = this.getChildren(nodeId);
        children.forEach(childId => {
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
        if (node) {
            node.probability = 0.9 * node.probability + 0.1 * value;
        }
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

        const x = pairs.map(p => p[0]);
        const y = pairs.map(p => p[1]);
        const n = pairs.length;

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
        if (leaves.length > 0) {
            this.removeNode(leaves[0]);
        }
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

export class CausalReasoner extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
        this.graph = config.graph ?? new CausalGraph(config);
        this.beliefs = new Map();
    }

    async initialize() {
        await this.graph.initialize();
        this.emit('initialized', { nodes: this.graph.nodes.size, edges: this.graph.edges.size });
    }

    async learn(cause, effect, context = {}) {
        const { action, reward } = context;

        if (!this.graph.nodes.has(cause)) this.graph.addNode(cause);
        if (!this.graph.nodes.has(effect)) this.graph.addNode(effect);

        const strength = reward > 0 ? 0.8 : 0.3;
        this.graph.addEdge(cause, effect, strength);

        this.graph.observe(cause, 1);
        this.graph.observe(effect, reward);

        this.beliefs.set(`${cause}->${effect}`, {
            cause, effect, action, reward,
            confidence: 0.5,
            timestamp: Date.now()
        });
    }

    queryCauses(effect) {
        const effectNode = this.graph.nodes.get(effect);
        if (!effectNode) return [];

        return Array.from(effectNode.parents).map(parentId => {
            const edge = this.graph.getEdge(parentId, effect);
            const belief = this.beliefs.get(`${parentId}->${effect}`);
            return {
                cause: parentId,
                strength: edge?.strength ?? 0,
                confidence: belief?.confidence ?? 0.5
            };
        });
    }

    queryEffects(cause) {
        const causeNode = this.graph.nodes.get(cause);
        if (!causeNode) return [];

        return Array.from(causeNode.children).map(childId => {
            const edge = this.graph.getEdge(cause, childId);
            return { effect: childId, strength: edge?.strength ?? 0 };
        });
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
            .map(c => ({
                explanation: `${c.cause} causes ${effect} (strength: ${c.strength.toFixed(2)}, confidence: ${c.confidence.toFixed(2)})`,
                cause: c.cause,
                strength: c.strength,
                confidence: c.confidence
            }));
    }

    getGraph() { return this.graph; }

    getState() {
        return {
            nodes: this.graph.nodes.size,
            edges: this.graph.edges.size,
            beliefs: this.beliefs.size
        };
    }

    async shutdown() {
        await this.graph.shutdown();
        this.beliefs.clear();
    }
}
