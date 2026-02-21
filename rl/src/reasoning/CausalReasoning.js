/**
 * Causal Reasoning Layer
 * Deep symbolic understanding through causal inference.
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor } from '../neurosymbolic/TensorLogicBridge.js';

/**
 * Causal Graph Node
 */
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

    addParent(parent) {
        this.parents.add(parent);
        return this;
    }

    addChild(child) {
        this.children.add(child);
        return this;
    }

    intervene(value) {
        this.intervention = value;
        this.state = 'intervened';
        return this;
    }

    reset() {
        this.intervention = null;
        this.counterfactual = null;
        this.state = 'unknown';
        return this;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            parents: Array.from(this.parents),
            children: Array.from(this.children),
            state: this.state,
            probability: this.probability,
            intervened: this.intervention !== null
        };
    }
}

/**
 * Causal Graph
 * Represents causal structure for reasoning.
 */
export class CausalGraph extends Component {
    constructor(config = {}) {
        super({
            maxNodes: config.maxNodes ?? 100,
            learningRate: config.learningRate ?? 0.1,
            ...config
        });
        
        this.nodes = new Map();
        this.edges = new Map();
        this.observations = [];
    }

    /**
     * Add a node to the graph.
     */
    addNode(id, config = {}) {
        if (this.nodes.size >= this.config.maxNodes) {
            this.prune();
        }
        
        const node = new CausalNode(id, config);
        this.nodes.set(id, node);
        this.emit('nodeAdded', { id, node });
        return node;
    }

    /**
     * Add a causal edge.
     */
    addEdge(from, to, strength = 1.0) {
        const fromNode = this.nodes.get(from);
        const toNode = this.nodes.get(to);
        
        if (!fromNode || !toNode) {
            throw new Error(`Invalid edge: ${from} -> ${to}`);
        }
        
        fromNode.addChild(to);
        toNode.addParent(from);
        
        const edgeId = `${from}->${to}`;
        this.edges.set(edgeId, { from, to, strength, observed: 0 });
        
        this.emit('edgeAdded', { from, to, strength });
        return this;
    }

    /**
     * Remove an edge.
     */
    removeEdge(from, to) {
        const fromNode = this.nodes.get(from);
        const toNode = this.nodes.get(to);
        
        if (fromNode) fromNode.children.delete(to);
        if (toNode) toNode.parents.delete(from);
        
        this.edges.delete(`${from}->${to}`);
        return this;
    }

    /**
     * Observe a variable.
     */
    observe(nodeId, value, confidence = 1.0) {
        const node = this.nodes.get(nodeId);
        if (!node) return this;
        
        node.probability = value;
        node.state = 'observed';
        
        this.observations.push({
            nodeId,
            value,
            confidence,
            timestamp: Date.now()
        });
        
        // Propagate through graph
        this.propagate(nodeId);
        
        return this;
    }

    /**
     * Intervene on a variable (do-operator).
     */
    intervene(nodeId, value) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;
        
        node.intervene(value);
        
        // Compute causal effect
        const effect = this.computeCausalEffect(nodeId, value);
        
        this.emit('intervention', { nodeId, value, effect });
        return effect;
    }

    /**
     * Compute causal effect of intervention.
     */
    computeCausalEffect(nodeId, value) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;
        
        const effects = new Map();
        
        // Forward propagation through children
        const toVisit = [node];
        const visited = new Set();
        
        while (toVisit.length > 0) {
            const current = toVisit.pop();
            if (visited.has(current.id)) continue;
            visited.add(current.id);
            
            for (const childId of current.children) {
                const child = this.nodes.get(childId);
                if (!child) continue;
                
                // Update child probability based on causal strength
                const edge = this.edges.get(`${current.id}->${childId}`);
                const influence = (edge?.strength ?? 1) * (value - child.probability);
                
                const oldProb = child.probability;
                child.probability = Math.max(0, Math.min(1, oldProb + influence * this.config.learningRate));
                
                effects.set(childId, {
                    before: oldProb,
                    after: child.probability,
                    change: child.probability - oldProb
                });
                
                toVisit.push(child);
            }
        }
        
        return Object.fromEntries(effects);
    }

    /**
     * Propagate observations through graph.
     */
    propagate(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        
        // Update children based on observation
        for (const childId of node.children) {
            const child = this.nodes.get(childId);
            if (!child) continue;
            
            // Bayesian update (simplified)
            const edge = this.edges.get(`${nodeId}->${childId}`);
            const strength = edge?.strength ?? 0.5;
            
            child.probability = child.probability * (1 - strength) + node.probability * strength;
        }
    }

    /**
     * Query counterfactual.
     */
    counterfactual(nodeId, hypotheticalValue, givenObservations) {
        // Save current state
        const saved = new Map();
        for (const [id, node] of this.nodes) {
            saved.set(id, { prob: node.probability, intervention: node.intervention });
        }
        
        // Apply given observations
        for (const [obsId, obsValue] of Object.entries(givenObservations)) {
            this.observe(obsId, obsValue);
        }
        
        // Compute counterfactual
        const result = this.computeCausalEffect(nodeId, hypotheticalValue);
        
        // Restore state
        for (const [id, { prob, intervention }] of saved) {
            const node = this.nodes.get(id);
            node.probability = prob;
            node.intervention = intervention;
        }
        
        return result;
    }

    /**
     * Find causal paths between nodes.
     */
    findPaths(from, to, maxDepth = 10) {
        const paths = [];
        const queue = [[from]];
        
        while (queue.length > 0 && paths.length < 100) {
            const path = queue.shift();
            const current = path[path.length - 1];
            
            if (current === to) {
                paths.push(path);
                continue;
            }
            
            if (path.length >= maxDepth) continue;
            
            const node = this.nodes.get(current);
            if (!node) continue;
            
            for (const child of node.children) {
                if (!path.includes(child)) {
                    queue.push([...path, child]);
                }
            }
        }
        
        return paths;
    }

    /**
     * Get ancestors of a node.
     */
    getAncestors(nodeId, maxDepth = 10) {
        const ancestors = new Set();
        const queue = [nodeId];
        let depth = 0;
        
        while (queue.length > 0 && depth < maxDepth) {
            const current = queue.shift();
            const node = this.nodes.get(current);
            if (!node) continue;
            
            for (const parent of node.parents) {
                if (!ancestors.has(parent)) {
                    ancestors.add(parent);
                    queue.push(parent);
                }
            }
            depth++;
        }
        
        return Array.from(ancestors);
    }

    /**
     * Get descendants of a node.
     */
    getDescendants(nodeId, maxDepth = 10) {
        const descendants = new Set();
        const queue = [nodeId];
        let depth = 0;
        
        while (queue.length > 0 && depth < maxDepth) {
            const current = queue.shift();
            const node = this.nodes.get(current);
            if (!node) continue;
            
            for (const child of node.children) {
                if (!descendants.has(child)) {
                    descendants.add(child);
                    queue.push(child);
                }
            }
            depth++;
        }
        
        return Array.from(descendants);
    }

    /**
     * Learn causal structure from observations.
     */
    learnStructure(trajectories, options = {}) {
        const { minStrength = 0.1, maxEdges = 50 } = options;
        
        // Count co-occurrences
        const cooccurrences = new Map();
        
        for (const trajectory of trajectories) {
            const states = trajectory.states ?? [trajectory];
            
            for (let t = 0; t < states.length - 1; t++) {
                const current = states[t];
                const next = states[t + 1];
                
                // Find variables that changed
                for (const [varId, value] of Object.entries(current)) {
                    const nextValue = next[varId];
                    if (nextValue !== undefined && nextValue !== value) {
                        // Look for potential causes
                        for (const [causeId, causeValue] of Object.entries(current)) {
                            if (causeId === varId) continue;
                            
                            const key = `${causeId}->${varId}`;
                            if (!cooccurrences.has(key)) {
                                cooccurrences.set(key, { count: 0, correlation: 0 });
                            }
                            
                            const entry = cooccurrences.get(key);
                            entry.count++;
                        }
                    }
                }
            }
        }
        
        // Create edges based on co-occurrences
        const sortedEdges = Array.from(cooccurrences.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, maxEdges);
        
        for (const [edgeKey, stats] of sortedEdges) {
            if (stats.count >= minStrength) {
                const [from, to] = edgeKey.split('->');
                
                if (!this.nodes.has(from)) this.addNode(from);
                if (!this.nodes.has(to)) this.addNode(to);
                
                this.addEdge(from, to, stats.count / trajectories.length);
            }
        }
        
        return this;
    }

    /**
     * Prune low-probability nodes.
     */
    prune() {
        const sorted = Array.from(this.nodes.entries())
            .sort((a, b) => a[1].probability - b[1].probability);
        
        const toRemove = sorted.slice(0, Math.floor(this.config.maxNodes * 0.1));
        
        for (const [id] of toRemove) {
            this.removeNode(id);
        }
    }

    /**
     * Remove a node.
     */
    removeNode(id) {
        const node = this.nodes.get(id);
        if (!node) return;
        
        // Remove edges
        for (const parent of node.parents) {
            this.removeEdge(parent, id);
        }
        for (const child of node.children) {
            this.removeEdge(id, child);
        }
        
        this.nodes.delete(id);
        this.emit('nodeRemoved', { id });
    }

    /**
     * Get graph statistics.
     */
    getStats() {
        return {
            nodes: this.nodes.size,
            edges: this.edges.size,
            observations: this.observations.length,
            interventions: Array.from(this.nodes.values()).filter(n => n.intervention !== null).length
        };
    }

    /**
     * Serialize graph.
     */
    toJSON() {
        return {
            nodes: Array.from(this.nodes.entries()).map(([id, node]) => node.toJSON()),
            edges: Array.from(this.edges.entries()).map(([id, edge]) => ({
                id,
                ...edge
            })),
            stats: this.getStats()
        };
    }
}

/**
 * Causal Reasoning Engine
 * Performs causal inference and explanation.
 */
export class CausalReasoner extends Component {
    constructor(config = {}) {
        super({
            graph: config.graph ?? new CausalGraph(),
            explanationDepth: config.explanationDepth ?? 3,
            ...config
        });
        
        this.graph = config.graph ?? new CausalGraph();
        this.inferenceHistory = [];
    }

    /**
     * Explain an outcome causally.
     */
    explain(outcome, context = {}) {
        const node = this.graph.nodes.get(outcome);
        if (!node) return { explanation: 'Unknown outcome', factors: [] };
        
        const factors = [];
        
        // Find causal ancestors
        const ancestors = this.graph.getAncestors(outcome, this.config.explanationDepth);
        
        for (const ancestorId of ancestors) {
            const ancestor = this.graph.nodes.get(ancestorId);
            if (!ancestor) continue;
            
            const edge = this.graph.edges.get(`${ancestorId}->${outcome}`);
            const pathStrength = edge?.strength ?? 0;
            
            factors.push({
                factor: ancestorId,
                value: ancestor.probability,
                influence: pathStrength * ancestor.probability,
                type: ancestor.type
            });
        }
        
        factors.sort((a, b) => Math.abs(b.influence) - Math.abs(a.influence));
        
        const explanation = this.generateExplanation(outcome, factors);
        
        this.inferenceHistory.push({
            type: 'explanation',
            outcome,
            factors,
            timestamp: Date.now()
        });
        
        return { explanation, factors };
    }

    /**
     * Generate natural language explanation.
     */
    generateExplanation(outcome, factors) {
        if (factors.length === 0) {
            return `No causal factors found for ${outcome}`;
        }
        
        const topFactors = factors.slice(0, 3);
        const positiveFactors = topFactors.filter(f => f.influence > 0);
        const negativeFactors = topFactors.filter(f => f.influence < 0);
        
        let explanation = `${outcome} was caused by `;
        
        if (positiveFactors.length > 0) {
            explanation += positiveFactors.map(f => 
                `${f.factor} (strength: ${f.influence.toFixed(2)})`
            ).join(', ');
        }
        
        if (negativeFactors.length > 0) {
            explanation += ` and inhibited by ${negativeFactors.map(f => 
                `${f.factor} (strength: ${f.influence.toFixed(2)})`
            ).join(', ')}`;
        }
        
        return explanation;
    }

    /**
     * Predict effect of intervention.
     */
    predictIntervention(nodeId, value) {
        const effect = this.graph.intervene(nodeId, value);
        
        this.inferenceHistory.push({
            type: 'intervention',
            nodeId,
            value,
            effect,
            timestamp: Date.now()
        });
        
        return effect;
    }

    /**
     * Answer causal query.
     */
    query(question, options = {}) {
        const { type, from, to, given } = this.parseQuery(question);
        
        switch (type) {
            case 'effect':
                return this.graph.computeCausalEffect(from, to);
            case 'path':
                return { paths: this.graph.findPaths(from, to) };
            case 'ancestor':
                return { ancestors: this.graph.getAncestors(from) };
            case 'descendant':
                return { descendants: this.graph.getDescendants(from) };
            default:
                return { error: 'Unknown query type' };
        }
    }

    /**
     * Parse causal query.
     */
    parseQuery(question) {
        // Simple query parsing
        const lower = question.toLowerCase();
        
        if (lower.includes('effect of') || lower.includes('causes')) {
            return { type: 'effect', from: this.extractVariable(question, 'from'), to: this.extractVariable(question, 'to') };
        }
        if (lower.includes('path') || lower.includes('how')) {
            return { type: 'path', from: this.extractVariable(question, 'from'), to: this.extractVariable(question, 'to') };
        }
        if (lower.includes('ancestor') || lower.includes('cause of')) {
            return { type: 'ancestor', from: this.extractVariable(question, 'node') };
        }
        
        return { type: 'unknown' };
    }

    extractVariable(question, role) {
        // Simple extraction - in production, use NLP
        const match = question.match(/(\w+)/);
        return match ? match[1] : 'unknown';
    }

    /**
     * Get inference history.
     */
    getHistory() {
        return this.inferenceHistory;
    }

    /**
     * Clear history.
     */
    clearHistory() {
        this.inferenceHistory = [];
    }
}
