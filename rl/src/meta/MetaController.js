import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { ModificationOperator, META_DEFAULTS, DEFAULT_OPERATORS, TypeMultipliers } from './ModificationOperator.js';

export class MetaController extends Component {
    constructor(config = {}) {
        super(mergeConfig(META_DEFAULTS, config));

        this.currentArchitecture = null;
        this.architectureHistory = [];
        this.performanceHistory = [];
        this.operatorPool = [];
        this.successfulOperators = [];
        this.failedOperators = [];
        this.evaluationBuffer = [];
        this.baselinePerformance = null;
        this.metrics = new MetricsTracker({
            modificationsProposed: 0,
            modificationsApplied: 0,
            modificationsSuccessful: 0,
            architectureGenerations: 0,
            bestImprovement: 0
        });
        this.generation = 0;
        this.noImprovementCount = 0;
    }

    async onInitialize() {
        this._initializeOperatorPool();
        this.emit('initialized', {
            operators: this.operatorPool.length,
            imagination: this.config.useImagination,
            maxGenerations: this.config.maxGenerations
        });
    }

    _initializeOperatorPool() {
        this.operatorPool = DEFAULT_OPERATORS.map(op => new ModificationOperator(op));
        this.operatorPool.push(
            new ModificationOperator({ type: 'modify', parameters: { componentId: 'policy', config: { learningRate: 0.0001 } } }),
            new ModificationOperator({ type: 'modify', parameters: { componentId: 'policy', config: { learningRate: 0.01 } } }),
            new ModificationOperator({ type: 'modify', parameters: { componentId: 'policy', config: { hiddenDim: 64 } } }),
            new ModificationOperator({ type: 'modify', parameters: { componentId: 'policy', config: { hiddenDim: 256 } } })
        );
    }

    setArchitecture(architecture) {
        this.currentArchitecture = architecture;
        this.baselinePerformance = null;
        this.performanceHistory = [];
        return this;
    }

    async evaluatePerformance(performance) {
        this.performanceHistory.push(performance);
        this.evaluationBuffer.push(performance);
        if (this.evaluationBuffer.length >= this.config.evaluationWindow) {
            await this._evaluateAndModify();
        }
        return this.metrics.getAll();
    }

    async _evaluateAndModify() {
        const avgPerformance = this.evaluationBuffer.reduce((a, b) => a + b, 0) / this.evaluationBuffer.length;
        if (this.baselinePerformance === null) {
            this.baselinePerformance = avgPerformance;
        } else {
            const improvement = (avgPerformance - this.baselinePerformance) / Math.abs(this.baselinePerformance || 1);
            if (improvement > this.config.minImprovement) {
                this.noImprovementCount = 0;
                this.metrics.set('bestImprovement', Math.max(this.metrics.get('bestImprovement'), improvement));
            } else {
                this.noImprovementCount++;
            }
            if (this.noImprovementCount >= this.config.patience || improvement < 0) {
                await this._proposeModification(improvement);
            }
        }
        this.evaluationBuffer = [];
    }

    async _proposeModification(currentImprovement) {
        const candidate = this._selectOperator(currentImprovement);
        if (!candidate) {return { success: false, reason: 'No suitable operator' };}
        this.metrics.increment('modificationsProposed');
        const result = await candidate.apply(this.currentArchitecture);
        if (result.success) {
            this.metrics.increment('modificationsApplied');
            this.metrics.increment('modificationsSuccessful');
            this.successfulOperators.push(candidate);
            this.architectureHistory.push({ generation: this.generation, operator: candidate, timestamp: Date.now() });
            this.generation++;
            this.metrics.increment('architectureGenerations');
        } else {
            this.failedOperators.push(candidate);
        }
        return { success: result.success, operator: candidate, result };
    }

    _selectOperator(currentImprovement) {
        const available = this.operatorPool.filter(op =>
            !this.failedOperators.some(f => f.type === op.type && JSON.stringify(f.parameters) === JSON.stringify(op.parameters))
        );
        if (available.length === 0) {return null;}
        const weights = available.map(op => op.priority * (TypeMultipliers[op.type] ?? 1.0) * (currentImprovement < 0 ? 1.5 : 1.0));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        for (let i = 0; i < available.length; i++) {
            random -= weights[i];
            if (random <= 0) {return available[i];}
        }
        return available[available.length - 1];
    }

    async evolveArchitecture(options = {}) {
        const { generations = this.config.maxGenerations, evaluateFn } = options;
        const evolutionLog = [];
        for (let gen = 0; gen < generations; gen++) {
            this.generation = gen;
            if (evaluateFn) {
                const performance = await evaluateFn(this.currentArchitecture);
                await this.evaluatePerformance(performance);
            }
            evolutionLog.push({ generation: gen, metrics: this.metrics.getAll() });
            if (this.noImprovementCount >= this.config.patience * 2) {break;}
        }
        return { finalMetrics: this.metrics.getAll(), generations: this.generation, log: evolutionLog };
    }

    async imagineArchitectures(count = 5) {
        if (!this.config.useImagination) {return { architectures: [], reason: 'Imagination disabled' };}
        const imagined = [];
        for (let i = 0; i < count; i++) {
            const numModifications = Math.floor(Math.random() * 3) + 1;
            const modifications = [];
            for (let j = 0; j < numModifications; j++) {
                const operator = this._selectOperator(0);
                if (operator) {modifications.push(operator);}
            }
            imagined.push({ id: `imagined_${Date.now()}_${i}`, modifications, horizon: this.config.imaginationHorizon });
        }
        return { architectures: imagined };
    }

    async tuneHyperparameters(paramRanges, evaluateFn, options = {}) {
        const { iterations = 50, strategy = 'bayesian' } = options;
        const bestConfig = {};
        let bestScore = -Infinity;
        const history = [];
        for (let i = 0; i < iterations; i++) {
            const config = this._sampleHyperparameters(paramRanges, strategy, history);
            const score = await evaluateFn(config);
            history.push({ config, score });
            if (score > bestScore) { bestScore = score; Object.assign(bestConfig, config); }
        }
        return { bestConfig, bestScore, history };
    }

    _sampleHyperparameters(paramRanges, strategy, history) {
        const config = {};
        for (const [key, range] of Object.entries(paramRanges)) {
            if (strategy === 'bayesian' && history.length > 5) {
                const best = history.reduce((a, b) => a.score > b.score ? a : b);
                if (Math.random() < 0.3 && best.config[key]) { config[key] = best.config[key]; continue; }
            }
            config[key] = Array.isArray(range) ? range[Math.floor(Math.random() * range.length)]
                : typeof range === 'object' && range.min !== undefined ? range.min + Math.random() * (range.max - range.min)
                : range;
        }
        return config;
    }

    getOperatorSuccessRate(operatorType) {
        const total = this.operatorPool.filter(op => op.type === operatorType).length;
        const successful = this.successfulOperators.filter(op => op.type === operatorType).length;
        return total > 0 ? successful / total : 0;
    }

    getBestOperators(topN = 5) {
        return this.successfulOperators.sort((a, b) => b.priority - a.priority).slice(0, topN);
    }

    getState() {
        return {
            generation: this.generation,
            currentArchitecture: this.currentArchitecture?.constructor?.name ?? null,
            metrics: this.metrics.getAll(),
            successfulOperators: this.successfulOperators.length,
            failedOperators: this.failedOperators.length,
            noImprovementCount: this.noImprovementCount,
            bestImprovement: this.metrics.get('bestImprovement')
        };
    }

    async onShutdown() {
        this.operatorPool = [];
        this.successfulOperators = [];
        this.failedOperators = [];
    }

    static createArchitectureSearch(config = {}) {
        return new MetaController({ ...config, explorationRate: 0.5, mutationRate: 0.4 });
    }

    static createHyperparameterTuner(config = {}) {
        return new MetaController({ ...config, modificationThreshold: 0.3, evaluationWindow: 50 });
    }

    static createComponentSelector(config = {}) {
        return new MetaController({ ...config, useImagination: true, imaginationHorizon: 20 });
    }

    static createMinimal(config = {}) {
        return new MetaController({ ...config, maxGenerations: 20, populationSize: 5 });
    }
}
