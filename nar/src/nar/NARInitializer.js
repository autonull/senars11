import {EmbeddingLayer} from '@senars/core/src/lm/EmbeddingLayer.js';
import {LM} from '@senars/core/src/lm/LM.js';
import {Focus} from '../memory/Focus.js';
import {Memory} from '../memory/Memory.js';
import {TermLayer} from '../memory/index.js';
import {InputProcessor} from './InputProcessor.js';
import {NarseseParser} from '../parser/NarseseParser.js';
import {EvaluationEngine, MetricsMonitor, ReasonerBuilder} from '../reason/index.js';
import {ReasoningAboutReasoning} from '../self/ReasoningAboutReasoning.js';
import {TaskManager} from '../task/index.js';
import {TermFactory} from '../term/index.js';
import {ExplanationService} from '@senars/core/src/tool/ExplanationService.js';
import {ToolIntegration} from '@senars/core/src/tool/ToolIntegration.js';
import {BudgetManager} from '@senars/core/src/util/BudgetManager.js';
import {ComponentManager} from '@senars/core/src/util/ComponentManager.js';

export class NARInitializer {
    constructor(nar, config, eventBus) {
        this.nar = nar;
        this.config = config;
        this.eventBus = eventBus;
    }

    initialize() {
        const componentManager = new ComponentManager({}, this.eventBus, this.nar);

        const base = this._initBaseSubsystem();
        const memory = this._initMemorySubsystem(base.termFactory);
        const reasoning = this._initReasoningSubsystem(memory, base);
        const tools = this._initToolSubsystem(base.lm);
        const monitoring = this._initMonitoringSubsystem();

        // Register components
        componentManager.registerComponent('termFactory', base.termFactory);
        componentManager.registerComponent('memory', memory.memory);
        componentManager.registerComponent('focus', memory.focus, ['memory']);
        componentManager.registerComponent('taskManager', reasoning.taskManager, ['memory', 'focus']);

        if (base.lm) {
            componentManager.registerComponent('lm', base.lm);
        }

        if (tools.toolIntegration) {
            componentManager.registerComponent('toolIntegration', tools.toolIntegration);
            if (tools.explanationService) {
                componentManager.registerComponent('explanationService', tools.explanationService, ['toolIntegration']);
            }
        }

        if (this.config.components) {
            componentManager.loadComponentsFromConfig(this.config.components);
        }

        return {
            componentManager,
            ...base,
            ...memory,
            ...reasoning,
            ...tools,
            ...monitoring
        };
    }

    _initBaseSubsystem() {
        const termFactory = new TermFactory(this.config.termFactory, this.eventBus);
        const parser = new NarseseParser(termFactory);
        const lm = this.config.lm?.enabled ? new LM() : null;
        return {termFactory, parser, lm};
    }

    _initMemorySubsystem(termFactory) {
        const memory = new Memory(this.config.memory, this.eventBus, termFactory);
        const focus = new Focus(this.config.focus);
        const termLayer = new TermLayer({capacity: this.config.termLayer?.capacity || 1000, ...this.config.termLayer});
        const embeddingLayer = this.config.embeddingLayer?.enabled ? new EmbeddingLayer(this.config.embeddingLayer) : null;
        return {memory, focus, termLayer, embeddingLayer};
    }

    _initReasoningSubsystem(memoryVals, baseVals) {
        const {memory} = memoryVals;
        const {termFactory, parser} = baseVals;

        const taskManager = new TaskManager(memory, null, this.config.taskManager);
        const evaluator = new EvaluationEngine(null, termFactory);
        const budgetManager = new BudgetManager({
            total: this.config.budget?.total ?? 10000,
            enableComplexityPenalty: false
        });

        const inputProcessor = new InputProcessor(this.config.taskManager || {}, {
            parser: parser,
            termFactory: termFactory
        });

        const reasoningAboutReasoning = new ReasoningAboutReasoning(this.nar, {...this.config.reasoningAboutReasoning});

        return {taskManager, evaluator, budgetManager, inputProcessor, reasoningAboutReasoning};
    }

    _initToolSubsystem(lm) {
        const toolIntegration = this.config.tools?.enabled !== false ? new ToolIntegration(this.config.tools || {}) : null;
        let explanationService = null;

        if (toolIntegration) {
            toolIntegration.connectToReasoningCore(this.nar);
            explanationService = new ExplanationService({lm: lm || null, ...this.config.tools?.explanation});
        }
        return {toolIntegration, explanationService};
    }

    _initMonitoringSubsystem() {
        const metricsMonitor = new MetricsMonitor({
            eventBus: this.eventBus,
            nar: this.nar, ...this.config.metricsMonitor
        });
        return {metricsMonitor};
    }

    initStreamReasoner(deps) {
        return ReasonerBuilder.build(this.config, deps);
    }

    registerDefaultRules(streamReasoner, deps) {
        return ReasonerBuilder.registerDefaultRules(streamReasoner, this.config, deps);
    }
}
