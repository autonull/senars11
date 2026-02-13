import {LMRule} from '../reason/LMRule.js';
import {LMRuleUtils} from '../reason/utils/LMRuleUtils.js';
import {createNarseseTranslationRule} from '../reason/rules/lm/LMNarseseTranslationRule.js';
import {createConceptElaborationRule} from '../reason/rules/lm/LMConceptElaborationRule.js';
import {createAnalogicalReasoningRule} from '../reason/rules/lm/LMAnalogicalReasoningRule.js';

export class LMRuleFactory {
    static createNarseseTranslationRule(dependencies) {
        return createNarseseTranslationRule(dependencies);
    }

    static createConceptElaborationRule(dependencies) {
        return createConceptElaborationRule(dependencies);
    }

    static createAnalogicalReasoningRule(dependencies) {
        return createAnalogicalReasoningRule(dependencies);
    }

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
            process: (lmResponse) => lmResponse ?? '',
            generate: (processedOutput) => processedOutput ? [] : [],
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
            process: (lmResponse) => lmResponse ?? '',
            generate: (processedOutput) => processedOutput ? [] : [],
            promptTemplate: template,
            ...rest
        });
    }

    static createSinglePremise(config) {
        const {id, lm, ...rest} = config;
        return LMRule.create({singlePremise: true, ...rest, id, lm});
    }

    static createPatternBased(config) {
        return LMRuleUtils.createPatternBasedRule(config);
    }

    static createPunctuationBased(config) {
        return LMRuleUtils.createPunctuationBasedRule(config);
    }

    static createPriorityBased(config) {
        return LMRuleUtils.createPriorityBasedRule(config);
    }

    static builder() {
        return new LMRuleBuilder();
    }

    static createCommonRule(type, dependencies, config = {}) {
        const {lm} = dependencies;
        const baseConfig = {
            id: config.id ?? `${type}`,
            lm,
            name: config.name ?? this._getTitleCase(type.replace('-', ' ')) + ' Rule',
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
            prompt: LMRuleUtils.createPromptTemplate('goalDecomposition', config.options),
            process: LMRuleUtils.createResponseProcessor('list', config.options),
            generate: LMRuleUtils.createTaskGenerator('multipleSubTasks', config.options),
            lm_options: {temperature: 0.6, max_tokens: 500, ...config.lm_options}
        });
    }

    static _createHypothesisRule(config) {
        return LMRule.create({
            ...config,
            condition: (primary) => primary?.punctuation === '.' &&
                (primary.getPriority?.() ?? primary.priority ?? 0) > 0.7 &&
                (primary.truth?.c ?? primary.truth?.confidence ?? 0) > 0.8,
            prompt: LMRuleUtils.createPromptTemplate('hypothesisGeneration'),
            process: LMRuleUtils.createResponseProcessor('single'),
            generate: LMRuleUtils.createTaskGenerator('singleTask', {punctuation: '?'}),
            lm_options: {temperature: 0.8, max_tokens: 200, ...config.lm_options}
        });
    }

    static _createCausalAnalysisRule(config) {
        return LMRule.create({
            ...config,
            condition: (primary) => primary?.punctuation === '.' &&
                (primary.getPriority?.() ?? primary.priority ?? 0) > 0.7 &&
                LMRuleUtils.createPatternBasedRule({patternType: 'temporalCausal'}).condition(primary),
            prompt: LMRuleUtils.createPromptTemplate('causalAnalysis'),
            process: LMRuleUtils.createResponseProcessor('single'),
            generate: LMRuleUtils.createTaskGenerator('singleTask', {punctuation: '.'}),
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