/**
 * Enhanced Composition Engine
 * Pipeline and graph-based composition with advanced execution
 */
import { CompositionEngine } from './CompositionEngine.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const ENHANCED_COMPOSITION_DEFAULTS = {
    parallel: true,
    timeout: 30000,
    retry: 0,
    maxDepth: 10
};

/**
 * Enhanced composition engine with graphs and advanced patterns
 */
export class EnhancedCompositionEngine extends CompositionEngine {
    constructor(config = {}) {
        super(mergeConfig(ENHANCED_COMPOSITION_DEFAULTS, config));
        this.graphs = new Map();
        this.executing = new Set();
    }

    /**
     * Create graph-based composition
     * @param {string} name - Graph name
     * @param {Array} nodes - Graph nodes
     * @param {Array} edges - Graph edges
     * @returns {EnhancedCompositionEngine} Self for chaining
     */
    createGraph(name, nodes, edges) {
        const graph = {
            name,
            nodes: new Map(nodes.map(n => [n.id, n])),
            edges: edges.map(e => ({
                from: e.from,
                to: e.to,
                condition: e.condition ?? null,
                transform: e.transform ?? null
            })),
            createdAt: Date.now()
        };

        this._validateGraph(graph);
        this.graphs.set(name, graph);
        return this;
    }

    _validateGraph(graph) {
        for (const edge of graph.edges) {
            if (!graph.nodes.has(edge.from)) {
                throw new Error(`Edge references non-existent node: ${edge.from}`);
            }
            if (!graph.nodes.has(edge.to)) {
                throw new Error(`Edge references non-existent node: ${edge.to}`);
            }
        }
    }

    /**
     * Execute graph
     * @param {string} name - Graph name
     * @param {any} input - Input
     * @param {object} context - Execution context
     * @returns {Promise<object>} Execution result
     */
    async executeGraph(name, input, context = {}) {
        const graph = this.graphs.get(name);
        if (!graph) {
            throw new Error(`Graph not found: ${name}`);
        }

        const results = new Map();
        const visited = new Set();
        const queue = [Array.from(graph.nodes.keys())[0]];

        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (visited.has(nodeId)) continue;

            const node = graph.nodes.get(nodeId);
            const nodeInput = nodeId === Array.from(graph.nodes.keys())[0]
                ? input
                : this._gatherNodeInputs(nodeId, graph, results);

            const nodeResult = await this._executeNode(node, nodeInput, context);
            results.set(nodeId, nodeResult);
            visited.add(nodeId);

            const successors = graph.edges
                .filter(e => e.from === nodeId)
                .map(e => e.to);

            queue.push(...successors);
        }

        return {
            results: Object.fromEntries(results),
            output: this._gatherGraphOutput(graph, results)
        };
    }

    _gatherNodeInputs(nodeId, graph, results) {
        const inputs = [];
        for (const edge of graph.edges) {
            if (edge.to === nodeId && results.has(edge.from)) {
                const sourceResult = results.get(edge.from);
                inputs.push(edge.transform ? edge.transform(sourceResult) : sourceResult);
            }
        }
        return inputs.length === 1 ? inputs[0] : inputs;
    }

    async _executeNode(node, input, context) {
        const component = node.component;
        const method = node.method ?? 'act';

        if (typeof component[method] !== 'function') {
            throw new Error(`Node method not found: ${method}`);
        }

        return component[method].call(component, input, context);
    }

    _gatherGraphOutput(graph, results) {
        const hasOutgoing = new Set(graph.edges.map(e => e.from));
        const leaves = Array.from(graph.nodes.keys()).filter(id => !hasOutgoing.has(id));

        if (leaves.length === 1) {
            return results.get(leaves[0]);
        }

        return Object.fromEntries(leaves.map(id => [id, results.get(id)]));
    }

    /**
     * Get graph info
     * @param {string} name - Graph name
     * @returns {object} Graph info
     */
    getGraph(name) {
        return this.graphs.get(name);
    }

    /**
     * List all graphs
     * @returns {Array} Graph list
     */
    listGraphs() {
        return Array.from(this.graphs.entries()).map(([name, graph]) => ({
            name,
            nodes: graph.nodes.size,
            edges: graph.edges.length,
            createdAt: graph.createdAt
        }));
    }

    /**
     * Remove graph
     * @param {string} name - Graph name
     * @returns {boolean} True if removed
     */
    removeGraph(name) {
        return this.graphs.delete(name);
    }

    /**
     * Clear all graphs
     * @returns {EnhancedCompositionEngine} Self for chaining
     */
    clearGraphs() {
        this.graphs.clear();
        return this;
    }
}
