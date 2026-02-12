
import {TaskBagPremiseSource} from './TaskBagPremiseSource.js';
import {Strategy} from './Strategy.js';
import {RuleExecutor} from './RuleExecutor.js';
import {RuleProcessor} from './RuleProcessor.js';
import {Reasoner as StreamReasoner} from './Reasoner.js';

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
        const { focus } = this.context;
        const config = {...this.config, ...options};
        const streamSamplingObjectives = config.streamSamplingObjectives || {priority: true};

        this.components.premiseSource = new TaskBagPremiseSource(
            focus,
            streamSamplingObjectives
        );
        return this;
    }

    useDefaultStrategy(options = {}) {
        const { focus, memory } = this.context;
        const config = {...this.config, ...options};

        this.components.strategy = new Strategy({
            ...config.streamStrategy,
            focus: focus,
            memory: memory
        });

        // Add strategies from config
        if (config.strategies) {
            for (const s of config.strategies) {
                this.components.strategy.addStrategy(s);
            }
        }

        return this;
    }

    useDefaultRuleExecutor(options = {}) {
        const config = {...this.config, ...options};
        this.components.ruleExecutor = new RuleExecutor(config.streamRuleExecutor || {});
        return this;
    }

    useDefaultRuleProcessor(options = {}) {
        const { termFactory } = this.context;
        const config = {...this.config, ...options};

        if (!this.components.ruleExecutor) {
            this.useDefaultRuleExecutor(options);
        }

        this.components.ruleProcessor = new RuleProcessor(this.components.ruleExecutor, {
            maxDerivationDepth: config.maxDerivationDepth || 10,
            termFactory: termFactory
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
            executionInterval: reasoningConfig.executionInterval
        };

        return new ReasonerBuilder(context)
            .withConfig(builderConfig)
            .build();
    }

    static async registerDefaultRules(streamReasoner, config, dependencies = {}) {
        const ruleExecutor = streamReasoner.ruleProcessor.ruleExecutor;

        // Import and register new stream reasoner rules
        const {
            InheritanceSyllogisticRule,
            ImplicationSyllogisticRule
        } = await import('./rules/nal/SyllogisticRule.js');
        const {ModusPonensRule} = await import('./rules/nal/ModusPonensRule.js');
        const {MetacognitionRules} = await import('./rules/nal/MetacognitionRules.js');

        ruleExecutor.register(new InheritanceSyllogisticRule());
        ruleExecutor.register(new ImplicationSyllogisticRule());
        ruleExecutor.register(new ModusPonensRule());

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
                 termFactory: streamReasoner.ruleProcessor.termFactory,
                 parser: dependencies.parser
             });
             ruleExecutor.register(rule);

             const {createConceptElaborationRule} = await import('./rules/lm/LMConceptElaborationRule.js');
             const elaborationRule = createConceptElaborationRule({
                 lm: dependencies.lm,
                 parser: dependencies.parser
             });
             ruleExecutor.register(elaborationRule);
        }
    }
}
