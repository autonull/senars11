import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { CausalEdge } from './CausalEdge.js';
import { CausalNode } from './CausalNode.js';
import { extractVariables } from '../utils/extractVariables.js';

const REASONING_DEFAULTS = {
    maxNodes: 100,
    learningRate: 0.1,
    minStrength: 0.1,
    maxEdges: 1000
};

export class CausalGraph extends Component {
    constructor(config = {}) {
        super(mergeConfig(REASONING_DEFAULTS, config));
        this.nodes = new Map();
        this.edges = new Map();
        this.observations = [];
    }

    addNode(id, config = {}) {
        if (this.nodes.size >= this.config.maxNodes) {this.prune();}
        const node = new CausalNode(id, config);
        this.nodes.set(id, node);
        this.emit('nodeAdded', { id, node });
        return node;
    }

    addEdge(from, to, strength = 1.0) {
        const fromNode = this.nodes.get(from);
        const toNode = this.nodes.get(to);
        if (!fromNode || !toNode) {throw new Error(`Invalid edge: ${from} -> ${to}`);}

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
        if (!node) {return false;}

        node.parents.forEach(p => this.nodes.get(p)?.children.delete(id));
        node.children.forEach(c => this.nodes.get(c)?.parents.delete(id));
        this.edges.forEach((edge, key) => { if (edge.from === id || edge.to === id) {this.edges.delete(key);} });

        this.nodes.delete(id);
        this.emit('nodeRemoved', { id });
        return true;
    }

    removeEdge(from, to) {
        const edgeKey = `${from}->${to}`;
        const edge = this.edges.get(edgeKey);
        if (!edge) {return false;}

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
        if (from === to) {return true;}
        if (visited.has(from)) {return false;}
        visited.add(from);
        return this.getChildren(from).some(child => this.hasPath(child, to, visited));
    }

    computeCausalEffect(nodeId, intervention) {
        const node = this.nodes.get(nodeId);
        if (!node) {return null;}
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
        if (this.observations.length > 1000) {this.observations.shift();}
        const node = this.nodes.get(nodeId);
        if (node) {node.probability = 0.9 * node.probability + 0.1 * value;}
    }

    learnStructure(trajectories, options = {}) {
        const { minStrength = this.config.minStrength } = options;
        const correlations = this._computeCorrelations(trajectories);

        correlations.forEach(({ from, to, strength }) => {
            if (strength >= minStrength) {
                if (!this.nodes.has(from)) {this.addNode(from);}
                if (!this.nodes.has(to)) {this.addNode(to);}
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
                        if (!correlations.has(key)) {correlations.set(key, { from: v1, to: v2, values: [] });}
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
        return extractVariables(state);
    }

    _pearsonCorrelation(pairs) {
        if (pairs.length < 2) {return 0;}
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
        if (leaves.length > 0) {this.removeNode(leaves[0]);}
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

export { CausalEdge } from './CausalEdge.js';
export { CausalNode } from './CausalNode.js';
