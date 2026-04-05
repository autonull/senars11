import {mergeConfig} from '../../utils/index.js';
import {CognitiveModule} from './CognitiveModule.js';

const REASONING_DEFAULTS = {reasoningEngine: null, inferenceDepth: 3, causalReasoning: false};

export class ReasoningModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(REASONING_DEFAULTS, config));
        this.beliefs = new Map();
        this.inferences = [];
    }

    async process(input, context = {}) {
        const {symbols} = input;
        this.updateBeliefs(symbols);
        const inferences = await this.performInference(context);
        const causalAnalysis = this.config.causalReasoning && this.config.reasoningEngine?.graph
            ? this.analyzeCausally(symbols) : null;
        this.setState('lastInferences', inferences);
        this.setState('beliefs', new Map(this.beliefs));
        return {beliefs: new Map(this.beliefs), inferences, causalAnalysis};
    }

    updateBeliefs(symbols) {
        const now = Date.now();
        symbols.forEach((value, key) => {
            const existing = this.beliefs.get(key);
            if (existing) {
                existing.confidence = (existing.confidence + value.confidence) / 2;
                existing.timestamp = now;
            } else {
                this.beliefs.set(key, {...value, timestamp: now});
            }
        });
        this.beliefs.forEach((belief, key) => {
            const age = now - belief.timestamp;
            belief.confidence *= Math.exp(-age / 3600000);
            if (belief.confidence < 0.1) {
                this.beliefs.delete(key);
            }
        });
    }

    async performInference(context) {
        const inferences = [];
        if (this.config.reasoningEngine) {
            const result = await this.config.reasoningEngine.infer(
                Array.from(this.beliefs.values()), {depth: this.config.inferenceDepth, ...context});
            inferences.push(...result);
        }
        inferences.push(...this.ruleBasedInference());
        return inferences;
    }

    ruleBasedInference() {
        const inferences = [];
        const beliefs = Array.from(this.beliefs.entries());
        for (let i = 0; i < beliefs.length; i++) {
            for (let j = i + 1; j < beliefs.length; j++) {
                const [key1, belief1] = beliefs[i];
                const [key2, belief2] = beliefs[j];
                if (this.canCombine(key1, key2)) {
                    inferences.push({
                        type: 'transitive',
                        from: [key1, key2],
                        result: this.combineBeliefs(belief1, belief2)
                    });
                }
            }
        }
        return inferences;
    }

    canCombine(key1, key2) {
        return key1.split('_')[0] === key2.split('_')[0];
    }

    combineBeliefs(b1, b2) {
        return {confidence: (b1.confidence + b2.confidence) / 2, value: b1.value + b2.value, timestamp: Date.now()};
    }

    analyzeCausally(symbols) {
        const graph = this.config.reasoningEngine?.graph;
        if (!graph) {
            return null;
        }
        const analysis = {};
        symbols.forEach((symbol, key) => {
            const effect = graph.computeCausalEffect?.(key, symbol.value);
            if (effect) {
                analysis[key] = effect;
            }
        });
        return analysis;
    }
}
