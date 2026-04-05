import {LMRule} from '../reason/LMRule.js';
import {Logger} from '@senars/core';

const trimResponse = (r) => r?.trim() ?? '';
const emptyGenerate = () => [];

export class LMRuleFactory {
    static create(config) {
        const {id, lm, ...rest} = config;
        if (!id || !lm) {
            throw new Error('LMRuleFactory.create: `id` and `lm` are required.');
        }
        return LMRule.create(config);
    }

    static createLegacy(id, lm, promptTemplate, responseProcessor, priority = 1.0, config = {}) {
        const newConfig = {...config, promptTemplate, responseProcessor, priority};
        return LMRule.create({id, lm, ...newConfig});
    }

    static createSimple(config) {
        const {id, lm, promptTemplate, priority = 1.0, ...rest} = config;

        const fullConfig = {
            id,
            lm,
            priority,
            promptTemplate,
            process: trimResponse,
            generate: emptyGenerate,
            ...rest
        };

        return LMRule.create(fullConfig);
    }

    static createInferenceRule(config) {
        return this._createBasicRule(config, 'Inference Rule',
            'Generates logical inferences using language models',
            `Given the task "{{taskTerm}}" of type "{{taskType}}" with truth value "{{taskTruth}}", please generate a logical inference or conclusion based on this information. Respond with a valid Narsese statement.`);
    }

    static createHypothesisRule(config) {
        return this._createBasicRule(config, 'Hypothesis Generation Rule',
            'Generates plausible hypotheses using language models',
            `Given the task "{{taskTerm}}" of type "{{taskType}}" with truth value "{{taskTruth}}", please generate a plausible hypothesis that could explain or relate to this information. Respond with a valid Narsese statement.`);
    }

    static _createBasicRule(config, name, description, template) {
        const {id, lm, priority = 1.0, ...rest} = config;

        return LMRule.create({
            id,
            lm,
            priority,
            name,
            description,
            condition: (primary) => primary?.term != null,
            prompt: () => template,
            process: trimResponse,
            generate: emptyGenerate,
            promptTemplate: template,
            ...rest
        });
    }

    static createSinglePremise(config) {
        const {id, lm, ...rest} = config;
        return LMRule.create({singlePremise: true, ...rest, id, lm});
    }

    static createPatternBased(config) {
        return LMRule.create({id: 'pattern-based', ...config});
    }

    static createPunctuationBased(config) {
        return LMRule.create({id: 'punctuation-based', ...config});
    }

    static createPriorityBased(config) {
        return LMRule.create({id: 'priority-based', ...config});
    }

    static createPunctuationBased(config) {
        return LMRule.create({id: 'punctuation-based', ...config});
    }

    static createPriorityBased(config) {
        return LMRule.create({id: 'priority-based', ...config});
    }

    static builder() {
        return new LMRuleBuilder();
    }

    static createCommonRule(type, dependencies, config = {}) {
        const {lm} = dependencies;
        const baseConfig = {
            id: config.id ?? `${type}`,
            lm,
            name: config.name ?? `${this._getTitleCase(type.replace('-', ' '))  } Rule`,
            description: config.description ?? this._getDescription(type),
            priority: config.priority ?? this._getDefaultPriority(type),
            ...config
        };

        switch (type) {
            case 'goal-decomposition':
                return this._createGoalDecompositionRule(baseConfig);
            case 'hypothesis-generation':
                return this._createHypothesisRule(baseConfig);
            case 'causal-analysis':
                return this._createCausalAnalysisRule(baseConfig);
            default:
                throw new Error(`Unknown common rule type: ${type}`);
        }
    }

    static _getTitleCase(str) {
        return str.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    static _getDescription(type) {
        const descriptions = {
            'goal-decomposition': 'Breaks down high-level goals into sub-goals',
            'hypothesis-generation': 'Generates hypotheses from beliefs',
            'causal-analysis': 'Analyzes causal relationships'
        };
        return descriptions[type] ?? 'A common rule type';
    }

    static _getDefaultPriority(type) {
        const priorities = {
            'goal-decomposition': 0.9,
            'hypothesis-generation': 0.6,
            'causal-analysis': 0.75
        };
        return priorities[type] ?? 0.5;
    }

    static _createGoalDecompositionRule(config) {
        return LMRule.create({
            ...config,
            condition: (primary) => primary?.punctuation === '!' && (primary.getPriority?.() ?? primary.priority ?? 0) > 0.7,
            prompt: () => `Decompose the following goal into smaller, actionable sub-goals. Output: List of subgoals, one per line`,
            process: trimResponse,
            generate: emptyGenerate,
            lm_options: {temperature: 0.6, max_tokens: 500, ...config.lm_options}
        });
    }

    static _createHypothesisRule(config) {
        return LMRule.create({
            ...config,
            condition: (primary) => primary?.punctuation === '.' &&
                (primary.getPriority?.() ?? primary.priority ?? 0) > 0.7 &&
                (primary.truth?.c ?? primary.truth?.confidence ?? 0) > 0.8,
            prompt: () => `Given the belief, generate a plausible hypothesis that could explain or relate to this information. Respond with a valid Narsese statement.`,
            process: trimResponse,
            generate: emptyGenerate,
            lm_options: {temperature: 0.8, max_tokens: 200, ...config.lm_options}
        });
    }

    static _createCausalAnalysisRule(config) {
        return LMRule.create({
            ...config,
            condition: (primary) => primary?.punctuation === '.' &&
                (primary.getPriority?.() ?? primary.priority ?? 0) > 0.7,
            prompt: () => `Analyze the causal relationships in the given statement. Respond with insights about cause and effect.`,
            process: trimResponse,
            generate: emptyGenerate,
            lm_options: {temperature: 0.4, max_tokens: 300, ...config.lm_options}
        });
    }

    static _createHypothesisRule(config) {
        return LMRule.create({
            ...config,
            condition: (primary) => primary?.punctuation === '.' &&
                (primary.getPriority?.() ?? primary.priority ?? 0) > 0.7 &&
                (primary.truth?.c ?? primary.truth?.confidence ?? 0) > 0.8,
            prompt: () => `Given the belief, generate a plausible hypothesis that could explain or relate to this information. Respond with a valid Narsese statement.`,
            process: trimResponse,
            generate: emptyGenerate,
            lm_options: {temperature: 0.8, max_tokens: 200, ...config.lm_options}
        });
    }

    static _createCausalAnalysisRule(config) {
        return LMRule.create({
            ...config,
            condition: (primary) => primary?.punctuation === '.' &&
                (primary.getPriority?.() ?? primary.priority ?? 0) > 0.7,
            prompt: () => `Analyze the causal relationships in the given statement. Respond with insights about cause and effect.`,
            process: trimResponse,
            generate: emptyGenerate,
            lm_options: {temperature: 0.4, max_tokens: 300, ...config.lm_options}
        });
    }
}

class LMRuleBuilder {
    constructor() {
        this.config = {};
    }

    id(id) {
        this.config.id = id;
        return this;
    }

    lm(lm) {
        this.config.lm = lm;
        return this;
    }

    name(name) {
        this.config.name = name;
        return this;
    }

    description(description) {
        this.config.description = description;
        return this;
    }

    priority(priority) {
        this.config.priority = priority;
        return this;
    }

    condition(conditionFn) {
        this.config.condition = conditionFn;
        return this;
    }

    prompt(promptFn) {
        this.config.prompt = promptFn;
        return this;
    }

    process(processFn) {
        this.config.process = processFn;
        return this;
    }

    generate(generateFn) {
        this.config.generate = generateFn;
        return this;
    }

    lmOptions(options) {
        this.config.lm_options = options;
        return this;
    }

    singlePremise(single = true) {
        this.config.singlePremise = single;
        return this;
    }

    build() {
        if (!this.config.id || !this.config.lm) {
            throw new Error('LM rule builder requires both id and lm to be set');
        }
        return LMRule.create(this.config);
    }
}