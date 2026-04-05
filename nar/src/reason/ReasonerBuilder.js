import {TaskBagPremiseSource} from './TaskBagPremiseSource.js';
import {Strategy} from './Strategy.js';
import {SimpleRuleExecutor} from './exec/SimpleRuleExecutor.js';
import {RuleProcessor} from './RuleProcessor.js';
import {Reasoner as StreamReasoner} from './Reasoner.js';
import {DecompositionStrategy, TaskMatchStrategy, TermLinkStrategy} from './strategy/index.js';

export class ReasonerBuilder {
    constructor(context = {}) {
        this.context = context;
        this.config = {};
        this.components = {
            premiseSource: null,
            strategy: null,
            ruleExecutor: null,
            ruleProcessor: null
        };
    }

    static build(config, context) {
        const reasoningConfig = config.reasoning || {};

        // Filter config to ensure legacy behavior (only passing specific props to StreamReasoner)
        const builderConfig = {
            maxDerivationDepth: reasoningConfig.maxDerivationDepth,
            cpuThrottleInterval: reasoningConfig.cpuThrottleInterval,
            streamSamplingObjectives: reasoningConfig.streamSamplingObjectives,
            streamStrategy: reasoningConfig.streamStrategy,
            streamRuleExecutor: reasoningConfig.streamRuleExecutor,
            strategies: reasoningConfig.strategies,
            executionMode: reasoningConfig.executionMode,
            executionInterval: reasoningConfig.executionInterval,
            useFormationStrategies: reasoningConfig.useFormationStrategies ?? true
        };

        return new ReasonerBuilder(context)
            .withConfig(builderConfig)
            .build();
    }

    static async registerDefaultRules(streamReasoner, config, dependencies = {}) {
        const {ruleExecutor} = streamReasoner.ruleProcessor;

        // Import and register new stream reasoner rules
        const {
            InheritanceSyllogisticRule,
            ImplicationSyllogisticRule
        } = await import('./rules/nal/SyllogisticRule.js');
        const {ModusPonensRule} = await import('./rules/nal/ModusPonensRule.js');
        const {MetacognitionRules} = await import('./rules/nal/MetacognitionRules.js');
        const {InductionRule, AbductionRule} = await import('./rules/nal/InductionAbductionRule.js');
        const {ConversionRule, ContrapositionRule} = await import('./rules/nal/ConversionRule.js');
        const {ComparisonRule} = await import('./rules/nal/ComparisonRule.js');
        const {AnalogyRule} = await import('./rules/nal/AnalogyRule.js');
        const {CompoundCompositionRule, CompoundDecompositionRule} = await import('./rules/nal/CompoundTermRules.js');

        ruleExecutor.register(new InheritanceSyllogisticRule());
        ruleExecutor.register(new ImplicationSyllogisticRule());
        ruleExecutor.register(new ModusPonensRule());
        ruleExecutor.register(new InductionRule());
        ruleExecutor.register(new AbductionRule());
        ruleExecutor.register(new ConversionRule());
        ruleExecutor.register(new ContrapositionRule());
        ruleExecutor.register(new ComparisonRule());
        ruleExecutor.register(new AnalogyRule());
        ruleExecutor.register(new CompoundCompositionRule());
        ruleExecutor.register(new CompoundDecompositionRule());

        // Register metacognition rules if enabled
        if (config.metacognition?.selfOptimization?.enabled) {
            for (const RuleClass of MetacognitionRules) {
                const rule = new RuleClass();
                ruleExecutor.register(rule);
            }
        }

        // Register LM rules if enabled
        if (config.lm?.enabled && dependencies.lm) {
            const {createNarseseTranslationRule} = await import('./rules/lm/LMNarseseTranslationRule.js');
            const rule = createNarseseTranslationRule({
                lm: dependencies.lm,
                termFactory: dependencies.termFactory,
                parser: dependencies.parser,
                eventBus: dependencies.eventBus
            });
            ruleExecutor.register(rule);

            const {createConceptElaborationRule} = await import('./rules/lm/LMConceptElaborationRule.js');
            const elaborationRule = createConceptElaborationRule({
                lm: dependencies.lm,
                parser: dependencies.parser,
                termFactory: dependencies.termFactory,
                eventBus: dependencies.eventBus,
                memory: dependencies.memory
            });
            ruleExecutor.register(elaborationRule);

            const {createAnalogicalReasoningRule} = await import('./rules/lm/LMAnalogicalReasoningRule.js');
            const analogyRule = createAnalogicalReasoningRule({
                lm: dependencies.lm,
                memory: dependencies.memory,
                embeddingLayer: dependencies.embeddingLayer,
                termFactory: dependencies.termFactory,
                eventBus: dependencies.eventBus
            });
            ruleExecutor.register(analogyRule);

            const {
                createGoalDecompositionRule,
                createHypothesisGenerationRule,
                createInteractiveClarificationRule,
                createExplanationGenerationRule
            } = await import('./rules/lm/index.js');

            ruleExecutor.register(createGoalDecompositionRule({
                lm: dependencies.lm,
                termFactory: dependencies.termFactory
            }));

            ruleExecutor.register(createHypothesisGenerationRule({
                lm: dependencies.lm,
                termFactory: dependencies.termFactory
            }));

            ruleExecutor.register(createInteractiveClarificationRule({
                lm: dependencies.lm,
                termFactory: dependencies.termFactory
            }));

            ruleExecutor.register(createExplanationGenerationRule({
                lm: dependencies.lm,
                termFactory: dependencies.termFactory
            }));
        }
    }

    withConfig(config) {
        this.config = {...this.config, ...config};
        return this;
    }

    withPremiseSource(premiseSource) {
        this.components.premiseSource = premiseSource;
        return this;
    }

    withStrategy(strategy) {
        this.components.strategy = strategy;
        return this;
    }

    withRuleExecutor(ruleExecutor) {
        this.components.ruleExecutor = ruleExecutor;
        return this;
    }

    withRuleProcessor(ruleProcessor) {
        this.components.ruleProcessor = ruleProcessor;
        return this;
    }

    useDefaultPremiseSource(options = {}) {
        const {focus} = this.context;
        const config = {...this.config, ...options};
        const streamSamplingObjectives = config.streamSamplingObjectives || {priority: true};

        this.components.premiseSource = new TaskBagPremiseSource(
            focus,
            streamSamplingObjectives
        );
        return this;
    }

    useDefaultStrategy(options = {}) {
        const {focus, memory, termFactory} = this.context;
        const config = {...this.config, ...options};

        this.components.strategy = new Strategy({
            ...config.streamStrategy,
            focus: focus,
            memory: memory,
            termFactory: termFactory
        });

        // Add legacy strategies from config
        if (config.strategies) {
            for (const s of config.strategies) {
                this.components.strategy.addStrategy(s);
            }
        }

        // Add default formation strategies unless disabled
        if (config.useFormationStrategies !== false) {
            this.useDefaultFormationStrategies();
        }

        return this;
    }

    /**
     * Add default premise formation strategies to the current strategy.
     *
     * Default strategies:
     * - TaskMatchStrategy (1.0): Pairs with existing tasks from focus
     * - DecompositionStrategy (0.8): Extracts subterms from compounds
     * - TermLinkStrategy (0.6): Uses TermLayer associations
     */
    useDefaultFormationStrategies(options = {}) {
        if (!this.components.strategy) {
            throw new Error('Strategy must be set before adding formation strategies');
        }

        const {strategy} = this.components;

        // TaskMatchStrategy: pairs with existing tasks (core NARS behavior)
        strategy.addFormationStrategy(new TaskMatchStrategy({
            priority: options.taskMatchPriority ?? 1.0,
            maxTasks: options.maxTasks ?? 100
        }));

        // DecompositionStrategy: extracts subterms for premise pairing (Java NARS style)
        strategy.addFormationStrategy(new DecompositionStrategy({
            priority: options.decompositionPriority ?? 0.8
        }));

        // TermLinkStrategy: uses conceptual associations
        strategy.addFormationStrategy(new TermLinkStrategy({
            priority: options.termLinkPriority ?? 0.6,
            maxLinks: options.maxLinks ?? 20
        }));

        // SemanticStrategy: uses embeddings for fuzzy matching
        if (this.context.embeddingLayer) {
            import('./strategy/SemanticStrategy.js').then(({SemanticStrategy}) => {
                strategy.addFormationStrategy(new SemanticStrategy(this.context.embeddingLayer, {
                    priority: options.semanticPriority ?? 0.7
                }));
            });
        }

        return this;
    }


    useDefaultRuleExecutor(options = {}) {
        const config = {...this.config, ...options};
        this.components.ruleExecutor = new SimpleRuleExecutor(config.streamRuleExecutor || {});
        return this;
    }

    useDefaultRuleProcessor(options = {}) {
        const {termFactory, budgetManager} = this.context;
        const config = {...this.config, ...options};

        if (!this.components.ruleExecutor) {
            this.useDefaultRuleExecutor(options);
        }

        this.components.ruleProcessor = new RuleProcessor(this.components.ruleExecutor, {
            maxDerivationDepth: config.maxDerivationDepth || 10,
            termFactory: termFactory,
            budgetManager: budgetManager
        });
        return this;
    }

    build() {
        if (!this.components.premiseSource) {
            this.useDefaultPremiseSource();
        }

        if (!this.components.strategy) {
            this.useDefaultStrategy();
        }

        if (!this.components.ruleProcessor) {
            this.useDefaultRuleProcessor();
        }

        const reasonerConfig = {
            maxDerivationDepth: 10,
            cpuThrottleInterval: 0,
            ...this.config
        };

        return new StreamReasoner(
            this.components.premiseSource,
            this.components.strategy,
            this.components.ruleProcessor,
            reasonerConfig
        );
    }
}
