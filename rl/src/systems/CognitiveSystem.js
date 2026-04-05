/**
 * Unified Cognitive System
 * Leverages core/reason/Reasoner and core/nar/NAR for reasoning
 */
import {Component} from '../composable/Component.js';
import {mergeConfig} from '../utils/index.js';
import {NAR, TermFactory} from '@senars/nar';
import {AttentionSystem} from './AttentionSystem.js';
import {CausalGraph} from './CausalGraph.js';
import {NeuroSymbolicFusion} from '../attention/NeuroSymbolicFusion.js';

const REASONING_DEFAULTS = {
    maxNodes: 100,
    learningRate: 0.1,
    minStrength: 0.1,
    maxEdges: 1000,
    useNAR: true,
    narConfig: {}
};

export class ReasoningSystem extends Component {
    constructor(config = {}) {
        super(mergeConfig(REASONING_DEFAULTS, config));
        this.graph = config.graph ?? new CausalGraph(config);
        this.beliefs = new Map();
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
        const {action, reward} = context;
        if (!this.graph.nodes.has(cause)) {
            this.graph.addNode(cause);
        }
        if (!this.graph.nodes.has(effect)) {
            this.graph.addNode(effect);
        }

        const strength = reward > 0 ? 0.8 : 0.3;
        this.graph.addEdge(cause, effect, strength);
        this.graph.observe(cause, 1);
        this.graph.observe(effect, reward);

        this.beliefs.set(`${cause}->${effect}`, {
            cause,
            effect,
            action,
            reward,
            confidence: 0.5,
            timestamp: Date.now()
        });

        if (this.nar) {
            await this.nar.input(`<${cause} --> ${effect}>.`);
        }
    }

    async reason(question, options = {}) {
        const {cycles = 50} = options;
        if (this.nar) {
            const result = await this.nar.ask(question, {cycles});
            return {answer: result, source: 'NAR', confidence: result?.truth?.confidence ?? 0};
        }
        return this.queryCauses(question);
    }

    queryCauses(effect) {
        const effectNode = this.graph.nodes.get(effect);
        if (!effectNode) {
            return [];
        }

        return Array.from(effectNode.parents).map(parentId => {
            const edge = this.graph.getEdge(parentId, effect);
            const belief = this.beliefs.get(`${parentId}->${effect}`);
            return {cause: parentId, strength: edge?.strength ?? 0, confidence: belief?.confidence ?? 0.5};
        });
    }

    queryEffects(cause) {
        const causeNode = this.graph.nodes.get(cause);
        if (!causeNode) {
            return [];
        }
        return Array.from(causeNode.children).map(childId => ({
            effect: childId,
            strength: this.graph.getEdge(cause, childId)?.strength ?? 0
        }));
    }

    intervene(cause, value) {
        return this.graph.computeCausalEffect(cause, value);
    }

    explain(effect, options = {}) {
        const causes = this.queryCauses(effect);
        const {minConfidence = 0.3} = options;
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

    getGraph() {
        return this.graph;
    }

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

export {ReasoningSystem as CausalReasoner};

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
        this.emit('initialized', {attention: true, reasoning: true});
    }

    process(neuralInput, symbolicInput, context = {}) {
        const attended = this.attention.attend(neuralInput, symbolicInput, context);
        return {attended, symbolic: symbolicInput, neural: neuralInput};
    }

    fuse(neural, symbolic, context = {}) {
        const fusionContext = {...NeuroSymbolicFusion, gate: this.gate};
        const methods = {
            gated: () => {
                const result = fusionContext.gatedFusion(neural, symbolic);
                this.gate = fusionContext.gate;
                return result;
            },
            attention: () => this.attention.multiHeadAttend(neural, symbolic, context),
            concat: () => NeuroSymbolicFusion.concatFusion(neural, symbolic),
            add: () => NeuroSymbolicFusion.addFusion(neural, symbolic)
        };
        return (methods[this.fusionMode] ?? methods.gated)();
    }

    getGate() {
        return this.gate;
    }

    async shutdown() {
        await this.attention.shutdown();
        await this.reasoning.shutdown();
    }
}

export {AttentionSystem} from './AttentionSystem.js';
export {CausalEdge} from './CausalEdge.js';
export {CausalGraph} from './CausalGraph.js';
export {CausalNode} from './CausalNode.js';
