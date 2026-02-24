/**
 * Enhanced Meta-Control and Self-Modification System
 * Unified framework for architecture evolution, hyperparameter tuning, and self-improvement
 */
import { Component } from '../composable/Component.js';
import { ComponentRegistry } from '../composable/ComponentRegistry.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const META_DEFAULTS = {
    metaLearningRate: 0.1,
    explorationRate: 0.3,
    modificationThreshold: 0.5,
    evaluationWindow: 100,
    populationSize: 10,
    elitismRate: 0.2,
    mutationRate: 0.3,
    crossoverRate: 0.5,
    useImagination: true,
    imaginationHorizon: 10,
    maxGenerations: 100,
    minImprovement: 0.01,
    patience: 10
};

const DEFAULT_OPERATORS = [
    { type: 'add', parameters: { stage: 'perception', componentId: 'attention' } },
    { type: 'add', parameters: { stage: 'reasoning', componentId: 'causal_reasoner' } },
    { type: 'modify', parameters: { componentId: 'policy', config: { learningRate: 0.001 } } },
    { type: 'modify', parameters: { componentId: 'policy', config: { hiddenDim: 128 } } },
    { type: 'connect', parameters: { fromId: 'perception', toId: 'reasoning' } }
];

const TypeMultipliers = { add: 1.2, remove: 0.8, modify: 1.0, replace: 1.1 };

/**
 * Modification Operator with enhanced execution
 */
export class ModificationOperator {
    constructor(config = {}) {
        Object.assign(this, {
            type: 'unknown',
            target: null,
            parameters: {},
            priority: 1.0,
            expectedImprovement: 0,
            applied: false,
            successful: null,
            ...config
        });
    }

    async apply(architecture, context = {}) {
        const executor = ModificationExecutor[this.type];
        return executor
            ? executor(architecture, this.parameters, context)
            : { success: false, error: `Unknown type: ${this.type}` };
    }

    toJSON() {
        return { ...this, parameters: { ...this.parameters } };
    }

    static fromJSON(json) {
        return new ModificationOperator(json);
    }

    static add(componentId, stage, config = {}) {
        return new ModificationOperator({
            type: 'add',
            parameters: { componentId, stage, config }
        });
    }

    static remove(componentId) {
        return new ModificationOperator({
            type: 'remove',
            parameters: { componentId }
        });
    }

    static modify(componentId, config) {
        return new ModificationOperator({
            type: 'modify',
            parameters: { componentId, config }
        });
    }

    static replace(oldId, newId, config = {}) {
        return new ModificationOperator({
            type: 'replace',
            parameters: { oldComponentId: oldId, newComponentId: newId, config }
        });
    }

    static connect(fromId, toId) {
        return new ModificationOperator({
            type: 'connect',
            parameters: { fromId, toId }
        });
    }
}

const ModificationExecutor = {
    async add(architecture, { componentId, stage, position, config }) {
        const registry = ComponentRegistry.getInstance?.() ?? new ComponentRegistry();
        const component = registry.create(componentId, config ?? {});
        
        if (stage && architecture.addToStage) {
            architecture.addToStage(stage, component, position);
        } else if (architecture.addComponent) {
            architecture.addComponent(component);
        } else if (architecture.add) {
            architecture.add(componentId, component);
        }
        
        return { success: true, component };
    },

    async remove(architecture, { componentId }) {
        let component;
        
        if (architecture.removeComponent) {
            component = architecture.removeComponent(componentId);
        } else if (architecture.remove) {
            component = architecture.get(componentId);
            architecture.remove(componentId);
        } else {
            return { success: false, error: 'Architecture does not support removal' };
        }

        if (component && component.shutdown) {
            await component.shutdown();
        }
        
        return { success: true, component };
    },

    async replace(architecture, { oldComponentId, newComponentId, config }) {
        const registry = ComponentRegistry.getInstance?.() ?? new ComponentRegistry();
        const newComponent = registry.create(newComponentId, config ?? {});
        
        let result;
        if (architecture.replaceComponent) {
            result = architecture.replaceComponent(oldComponentId, newComponent);
        } else {
            await this.remove(architecture, { componentId: oldComponentId });
            result = await this.add(architecture, { componentId: newComponentId, component: newComponent });
        }
        
        return result.success ? { success: true, oldComponent: result.old, newComponent } : result;
    },

    async modify(architecture, { componentId, config, method, args }) {
        const component = architecture.getComponent?.(componentId) ?? architecture.get?.(componentId);
        if (!component) return { success: false, error: 'Component not found' };

        if (config) Object.assign(component.config, config);

        if (method && typeof component[method] === 'function') {
            const result = await component[method](...(args ?? []));
            return { success: true, result };
        }

        return { success: true, component };
    },

    async connect(architecture, { fromId, fromOutput, toId, toInput }) {
        if (architecture.connect) {
            architecture.connect(fromId, fromOutput ?? 'output', toId, toInput ?? 'input');
        }
        return { success: true };
    },

    async disconnect(architecture, { fromId, toId }) {
        if (architecture.disconnect) {
            architecture.disconnect(fromId, toId);
        }
        return { success: true };
    }
};

/**
 * Enhanced MetaController with self-modification capabilities
 */
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
        
        // Add hyperparameter operators
        this.operatorPool.push(
            new ModificationOperator({
                type: 'modify',
                parameters: { componentId: 'policy', config: { learningRate: 0.0001 } }
            }),
            new ModificationOperator({
                type: 'modify',
                parameters: { componentId: 'policy', config: { learningRate: 0.01 } }
            }),
            new ModificationOperator({
                type: 'modify',
                parameters: { componentId: 'policy', config: { hiddenDim: 64 } }
            }),
            new ModificationOperator({
                type: 'modify',
                parameters: { componentId: 'policy', config: { hiddenDim: 256 } }
            })
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
        if (!candidate) return { success: false, reason: 'No suitable operator' };

        this.metrics.increment('modificationsProposed');

        const result = await candidate.apply(this.currentArchitecture);
        
        if (result.success) {
            this.metrics.increment('modificationsApplied');
            this.metrics.increment('modificationsSuccessful');
            this.successfulOperators.push(candidate);
            this.architectureHistory.push({
                generation: this.generation,
                operator: candidate,
                timestamp: Date.now()
            });
            this.generation++;
            this.metrics.increment('architectureGenerations');
        } else {
            this.failedOperators.push(candidate);
        }

        return { success: result.success, operator: candidate, result };
    }

    _selectOperator(currentImprovement) {
        const available = this.operatorPool.filter(op => {
            const isFailed = this.failedOperators.some(f => 
                f.type === op.type && JSON.stringify(f.parameters) === JSON.stringify(op.parameters)
            );
            return !isFailed;
        });

        if (available.length === 0) return null;

        // Weight by expected improvement and type
        const weights = available.map(op => {
            const typeMultiplier = TypeMultipliers[op.type] ?? 1.0;
            const improvementFactor = currentImprovement < 0 ? 1.5 : 1.0;
            return op.priority * typeMultiplier * improvementFactor;
        });

        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < available.length; i++) {
            random -= weights[i];
            if (random <= 0) return available[i];
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

            evolutionLog.push({
                generation: gen,
                metrics: this.metrics.getAll()
            });

            if (this.noImprovementCount >= this.config.patience * 2) {
                break;
            }
        }

        return {
            finalMetrics: this.metrics.getAll(),
            generations: this.generation,
            log: evolutionLog
        };
    }

    async imagineArchitectures(count = 5) {
        if (!this.config.useImagination) {
            return { architectures: [], reason: 'Imagination disabled' };
        }

        const imagined = [];
        
        for (let i = 0; i < count; i++) {
            const numModifications = Math.floor(Math.random() * 3) + 1;
            const modifications = [];

            for (let j = 0; j < numModifications; j++) {
                const operator = this._selectOperator(0);
                if (operator) modifications.push(operator);
            }

            imagined.push({
                id: `imagined_${Date.now()}_${i}`,
                modifications,
                horizon: this.config.imaginationHorizon
            });
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

            if (score > bestScore) {
                bestScore = score;
                Object.assign(bestConfig, config);
            }
        }

        return { bestConfig, bestScore, history };
    }

    _sampleHyperparameters(paramRanges, strategy, history) {
        const config = {};

        for (const [key, range] of Object.entries(paramRanges)) {
            if (strategy === 'bayesian' && history.length > 5) {
                // Simple Bayesian-inspired: bias toward best performing
                const best = history.reduce((a, b) => a.score > b.score ? a : b);
                const bias = 0.3;
                const random = Math.random();
                
                if (random < bias && best.config[key]) {
                    config[key] = best.config[key];
                    continue;
                }
            }

            if (Array.isArray(range)) {
                config[key] = range[Math.floor(Math.random() * range.length)];
            } else if (typeof range === 'object' && range.min !== undefined) {
                config[key] = range.min + Math.random() * (range.max - range.min);
            } else {
                config[key] = range;
            }
        }

        return config;
    }

    getOperatorSuccessRate(operatorType) {
        const total = this.operatorPool.filter(op => op.type === operatorType).length;
        const successful = this.successfulOperators.filter(op => op.type === operatorType).length;
        return total > 0 ? successful / total : 0;
    }

    getBestOperators(topN = 5) {
        return this.successfulOperators
            .sort((a, b) => b.priority - a.priority)
            .slice(0, topN);
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

    // Factory methods
    static createArchitectureSearch(config = {}) {
        return new MetaController({ ...config, explorationRate: 0.5, mutationRate: 0.4 });
    }

    static createHyperparameterTuner(config = {}) {
        return new MetaController({ 
            ...config, 
            modificationThreshold: 0.3,
            evaluationWindow: 50
        });
    }

    static createComponentSelector(config = {}) {
        return new MetaController({ 
            ...config, 
            useImagination: true,
            imaginationHorizon: 20
        });
    }

    static createMinimal(config = {}) {
        return new MetaController({ 
            ...config,
            maxGenerations: 20,
            populationSize: 5
        });
    }
}

/**
 * Architecture Evolver for population-based evolution
 */
export class ArchitectureEvolver {
    constructor(config = {}) {
        this.config = mergeConfig(META_DEFAULTS, config);
        this.population = [];
        this.generation = 0;
        this.history = [];
    }

    initialize(populationSize, baseArchitecture, variationFn) {
        this.population = [baseArchitecture];

        for (let i = 1; i < populationSize; i++) {
            const variant = variationFn(baseArchitecture, i);
            this.population.push(variant);
        }

        return this.population;
    }

    async evolve(fitnessFn, options = {}) {
        const { generations = 10, elitismRate = 0.2, mutationRate = 0.3, crossoverRate = 0.5 } = options;
        const evolutionHistory = [];

        for (let gen = 0; gen < generations; gen++) {
            this.generation = gen;

            // Evaluate fitness
            const fitnessScores = await Promise.all(this.population.map(fitnessFn));
            
            // Selection
            const elites = this._selectElites(fitnessScores, elitismRate);
            const offspring = [];

            // Crossover
            while (offspring.length < this.population.length * crossoverRate) {
                const [p1, p2] = this._tournamentSelect(fitnessScores, 3);
                const child = this._crossover(p1, p2);
                offspring.push(child);
            }

            // Mutation
            const mutated = offspring.map(ind => this._mutate(ind, mutationRate));

            // New population
            this.population = [...elites, ...mutated].slice(0, this.population.length);

            evolutionHistory.push({
                generation: gen,
                bestFitness: Math.max(...fitnessScores),
                avgFitness: fitnessScores.reduce((a, b) => a + b, 0) / fitnessScores.length
            });
        }

        return {
            finalPopulation: this.population,
            history: evolutionHistory,
            bestIndex: this._getBestIndex(await Promise.all(this.population.map(fitnessFn)))
        };
    }

    _selectElites(fitnessScores, elitismRate) {
        const eliteCount = Math.floor(this.population.length * elitismRate);
        const indexed = fitnessScores.map((f, i) => ({ fitness: f, index: i }));
        indexed.sort((a, b) => b.fitness - a.fitness);
        return indexed.slice(0, eliteCount).map(e => this.population[e.index]);
    }

    _tournamentSelect(fitnessScores, tournamentSize) {
        const selected = [];
        for (let i = 0; i < 2; i++) {
            let bestIdx = -1;
            let bestFitness = -Infinity;

            for (let t = 0; t < tournamentSize; t++) {
                const idx = Math.floor(Math.random() * this.population.length);
                if (fitnessScores[idx] > bestFitness) {
                    bestFitness = fitnessScores[idx];
                    bestIdx = idx;
                }
            }
            selected.push(this.population[bestIdx]);
        }
        return selected;
    }

    _crossover(p1, p2) {
        // Simple crossover - in practice would depend on architecture representation
        return Math.random() > 0.5 ? p1 : p2;
    }

    _mutate(individual, mutationRate) {
        if (Math.random() < mutationRate) {
            // Simple mutation - in practice would modify architecture
            return individual;
        }
        return individual;
    }

    _getBestIndex(fitnessScores) {
        return fitnessScores.indexOf(Math.max(...fitnessScores));
    }
}

export { MetaController as SelfModifier };
export { MetaController as ArchitectureSearch };
export { ArchitectureEvolver as Evolver };
