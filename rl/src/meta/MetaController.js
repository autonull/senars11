import { Component } from '../composable/Component.js';
import { ComponentRegistry } from '../composable/ComponentRegistry.js';
import { CompositionEngine } from '../composable/CompositionEngine.js';
import { NeuroSymbolicBridge } from '../bridges/NeuroSymbolicBridge.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
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
    useNARSReasoning: true,
    useMettaRepresentation: true
};

const DEFAULT_OPERATORS = [
    { type: 'add', parameters: { stage: 'perception', componentId: 'attention' } },
    { type: 'add', parameters: { stage: 'reasoning', componentId: 'causal_reasoner' } },
    { type: 'add', parameters: { stage: 'action', componentId: 'uncertainty_estimator' } },
    { type: 'modify', parameters: { componentId: 'policy', config: { learningRate: 0.001 } } },
    { type: 'modify', parameters: { componentId: 'policy', config: { hiddenDim: 128 } } },
    { type: 'connect', parameters: { fromId: 'perception', fromOutput: 'features', toId: 'reasoning', toInput: 'symbols' } }
];

const TypeMultipliers = { add: 1.2, remove: 0.8, modify: 1.0 };

const ModificationExecutor = {
    async add(architecture, { componentId, stage, position, config }) {
        const component = ComponentRegistry.getInstance().create(componentId, config ?? {});
        stage ? architecture.addToStage(stage, component, position) : architecture.addComponent(component);
        return { success: true, component };
    },

    async remove(architecture, { componentId }) {
        const component = architecture.getComponent(componentId);
        if (!component) return { success: false, error: 'Component not found' };

        await component.shutdown();
        architecture.removeComponent(componentId);
        return { success: true, component };
    },

    async replace(architecture, { oldComponentId, newComponentId, config }) {
        const newComponent = ComponentRegistry.getInstance().create(newComponentId, config ?? {});
        const result = architecture.replaceComponent(oldComponentId, newComponent);
        return result.success ? { success: true, oldComponent: result.old, newComponent } : result;
    },

    async modify(architecture, { componentId, config, method, args }) {
        const component = architecture.getComponent(componentId);
        if (!component) return { success: false, error: 'Component not found' };

        if (config) Object.assign(component.config, config);

        if (method && typeof component[method] === 'function') {
            const result = await component[method](...(args ?? []));
            return { success: true, result };
        }

        return { success: true, component };
    },

    async connect(architecture, { fromId, fromOutput, toId, toInput }) {
        architecture.connect(fromId, fromOutput, toId, toInput);
        return { success: true };
    },

    async disconnect(architecture, { fromId, toId }) {
        architecture.disconnect(fromId, toId);
        return { success: true };
    }
};

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
}

export class MetaController extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));

        this.currentArchitecture = null;
        this.architectureHistory = [];
        this.performanceHistory = [];
        this.operatorPool = [];
        this.successfulOperators = [];
        this.failedOperators = [];
        this.evaluationBuffer = [];
        this.baselinePerformance = null;
        this.bridge = null;
        this.compositionEngine = new CompositionEngine();
        this.metrics = { modificationsProposed: 0, modificationsApplied: 0, modificationsSuccessful: 0, architectureGenerations: 0 };
    }

    async onInitialize() {
        let mettaInterpreter = this.config.mettaInterpreter;

        if (!mettaInterpreter && this.config.useMettaRepresentation) {
            try {
                const { MeTTaInterpreter } = await import('@senars/metta');
                mettaInterpreter = new MeTTaInterpreter();
            } catch (e) {
                console.warn('MeTTa Interpreter not available, running without MeTTa support.', e);
                this.config.useMettaRepresentation = false;
            }
        }

        this.bridge = new NeuroSymbolicBridge({
            senarsConfig: this.config.senarsConfig,
            mettaConfig: this.config.mettaConfig,
            mettaInterpreter
        });

        await this.bridge.initialize();
        this._initializeOperatorPool();
        this.emit('initialized', { operators: this.operatorPool.length, imagination: this.config.useImagination });
    }

    _initializeOperatorPool() {
        this.operatorPool = DEFAULT_OPERATORS.map(config => new ModificationOperator(config));
    }

    setArchitecture(architecture) {
        this.currentArchitecture = architecture;
        this.architectureHistory.push({ architecture, timestamp: Date.now(), generation: 0 });
        this.baselinePerformance = null;
    }

    getArchitecture() {
        return this.currentArchitecture;
    }

    async evaluatePerformance(performance) {
        const now = Date.now();
        this.evaluationBuffer.push({ performance, timestamp: now, architecture: this.currentArchitecture });
        this.performanceHistory.push({ value: performance, timestamp: now, architectureId: this.architectureHistory.length - 1 });

        if (this.evaluationBuffer.length > this.config.evaluationWindow) this.evaluationBuffer.shift();

        if (this.performanceHistory.length >= this.config.evaluationWindow) {
            const recent = this.performanceHistory.slice(-this.config.evaluationWindow);
            this.baselinePerformance = recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
        }

        if (this._shouldModifyArchitecture(performance)) {
            const modification = await this.proposeModification();
            if (modification) return this.applyModification(modification);
        }

        if (this.metrics.modificationsApplied % 10 === 0) {
            await this.optimizeHyperparameters();
        }

        return { modified: false };
    }

    async optimizeHyperparameters() {
        if (!this.bridge?.metta) return;

        try {
            if (!this._optimizerScriptLoaded) {
                const fs = await import('fs');
                const path = await import('path');
                const scriptPath = path.resolve('rl/src/meta/strategies/self_optimizer.metta');

                if (fs.existsSync(scriptPath)) {
                    const script = fs.readFileSync(scriptPath, 'utf-8');
                    await this.bridge.metta.run(script);
                    this._optimizerScriptLoaded = true;
                }
            }

            const { grounded, exp, sym } = await import('@senars/metta');
            const controllerAtom = grounded(this);
            const expr = exp(sym('optimize-hyperparameters'), [controllerAtom]);

            console.log('Optimizing hyperparameters...');
            await this.bridge.metta.evaluateAsync(expr);
        } catch (e) {
            console.error('Self-optimization failed:', e);
        }
    }

    _shouldModifyArchitecture(currentPerformance) {
        if (!this.baselinePerformance) return false;
        const improvement = (currentPerformance - this.baselinePerformance) / (Math.abs(this.baselinePerformance) + 1e-6);
        return improvement < -this.config.modificationThreshold;
    }

    async proposeModification() {
        this.metrics.modificationsProposed++;

        const candidates = await this._generateModificationCandidates();
        if (candidates.length === 0) return null;

        const evaluated = this.config.useImagination
            ? await this._evaluateInImagination(candidates)
            : await this._evaluateWithHeuristics(candidates);

        const best = evaluated.reduce((max, c) => c.expectedImprovement > max.expectedImprovement ? c : max, evaluated[0]);

        return Math.random() < this.config.explorationRate
            ? evaluated[Math.floor(Math.random() * evaluated.length)]
            : best;
    }

    async _generateModificationCandidates() {
        const candidates = this.operatorPool.map(operator =>
            new ModificationOperator({ ...operator, priority: this._computeOperatorPriority(operator) })
        );

        if (this.config.useNARSReasoning && this.bridge?.senarsBridge) {
            candidates.push(...await this._generateNARSOperators());
        }

        if (this.config.useMettaRepresentation && this.bridge?.metta) {
            candidates.push(...await this._generateMettaOperators());
        }

        return candidates;
    }

    _computeOperatorPriority(operator) {
        const getRate = (pool) => {
            const match = pool.filter(o => o.type === operator.type).length;
            return match / (pool.length + 1);
        };

        const successRate = getRate(this.successfulOperators);
        const failRate = getRate(this.failedOperators);

        return operator.priority * (1 + successRate) * (1 - failRate * 0.5);
    }

    async _generateNARSOperators() {
        if (!this.bridge?.senarsBridge) return [];

        const result = await this.bridge.askNarsese('<(?modification) --> architecture_improvement>?', { cycles: 50 });
        if (!result?.substitution) return [];

        const modification = result.substitution['?modification'];
        return modification ? [new ModificationOperator({
            type: 'modify',
            target: modification.toString(),
            parameters: { componentId: modification.toString(), config: { priority: result.truth?.confidence ?? 0.5 } }
        })] : [];
    }

    async _generateMettaOperators() {
        if (!this.bridge?.metta) return [];

        try {
            if (!this._mettaScriptLoaded) {
                const fs = await import('fs');
                const path = await import('path');
                const scriptPath = path.resolve('rl/src/meta/strategies/architecture_search.metta');

                if (fs.existsSync(scriptPath)) {
                    const script = fs.readFileSync(scriptPath, 'utf-8');
                    await this.bridge.metta.run(script);
                    this._mettaScriptLoaded = true;
                } else {
                    return [];
                }
            }

            const { grounded, exp, sym } = await import('@senars/metta');
            const controllerAtom = grounded(this);
            const expr = exp(sym('generate-modifications'), [controllerAtom]);
            const result = await this.bridge.metta.evaluateAsync(expr);

            if (!result) return [];

            const results = Array.isArray(result) ? result : [result];
            const operators = [];

            for (const atom of results) {
                if (atom.type === 'grounded' && atom.value?.type && atom.value?.parameters) {
                    operators.push(new ModificationOperator({
                        type: atom.value.type,
                        parameters: atom.value.parameters,
                        priority: atom.value.priority || 1.0
                    }));
                }
            }
            return operators;

        } catch (e) {
            console.error('Error generating MeTTa operators:', e);
            return [];
        }
    }

    async _evaluateInImagination(candidates) {
        return Promise.all(candidates.map(async candidate => {
            const imaginedArch = this._createImaginedArchitecture(candidate);
            const imaginedPerformance = await this._simulatePerformance(imaginedArch);
            return {
                ...candidate,
                expectedImprovement: this._computeExpectedImprovement(imaginedPerformance, this.baselinePerformance),
                imaginedPerformance
            };
        }));
    }

    async _evaluateWithHeuristics(candidates) {
        return candidates.map(candidate => {
            let score = candidate.priority * (TypeMultipliers[candidate.type] ?? 1.0);

            if (candidate.target) {
                const component = this.currentArchitecture?.getComponent(candidate.target);
                if (component?.metrics?.errorRate > 0.5) score *= 1.5;
            }

            return { ...candidate, expectedImprovement: score * 0.1 };
        });
    }

    _createImaginedArchitecture(modification) {
        return JSON.parse(JSON.stringify(this.currentArchitecture));
    }

    async _simulatePerformance(architecture) {
        let totalReward = 0;
        for (let step = 0; step < this.config.imaginationHorizon; step++) {
            totalReward += Math.random() * 2 - 1;
        }
        return totalReward / this.config.imaginationHorizon;
    }

    _computeExpectedImprovement(imaginedPerformance, baseline) {
        if (!baseline) return imaginedPerformance * 0.1;
        return (imaginedPerformance - baseline) / (Math.abs(baseline) + 1e-6);
    }

    async applyModification(modification) {
        if (!this.currentArchitecture) return { success: false, error: 'No architecture set' };

        try {
            const result = await modification.apply(this.currentArchitecture);

            if (result.success) {
                modification.applied = true;
                this.metrics.modificationsApplied++;

                this.architectureHistory.push({
                    architecture: this.currentArchitecture,
                    modification,
                    timestamp: Date.now(),
                    generation: this.architectureHistory.length
                });

                return { success: true, modification, newArchitecture: this.currentArchitecture };
            }
            return result;
        } catch (e) {
            modification.successful = false;
            this.failedOperators.push(modification);
            return { success: false, error: e.message };
        }
    }

    recordOutcome(modification, success, performance) {
        modification.successful = success;
        (success ? this.successfulOperators : this.failedOperators).push(modification);
        if (success) this.metrics.modificationsSuccessful++;
        this._updateOperatorPriorities(success);
    }

    _updateOperatorPriorities(success) {
        const factor = success ? 1.1 : 0.9;
        for (const op of this.operatorPool) {
            if (op.applied) op.priority *= factor;
        }
    }

    async evolveArchitecture(generations = 10, options = {}) {
        const { fitnessFn, parallel = true } = options;
        let population = this._initializePopulation();

        for (let gen = 0; gen < generations; gen++) {
            const fitnesses = await this._evaluatePopulation(population, fitnessFn, parallel);
            const parents = this._selectParents(population, fitnesses);
            const offspring = this._crossover(parents);
            const mutated = this._mutate(offspring);
            population.splice(0, mutated.length, ...mutated);
        }

        this.metrics.architectureGenerations++;
        return population.reduce((max, arch) => arch.fitness > max.fitness ? arch : max, population[0]).architecture;
    }

    _initializePopulation() {
        const population = [{ architecture: this.currentArchitecture, fitness: 0, generation: 0 }];
        for (let i = 1; i < this.config.populationSize; i++) {
            population.push({ architecture: this._mutateArchitecture(this.currentArchitecture), fitness: 0, generation: 0 });
        }
        return population;
    }

    async _evaluatePopulation(population, fitnessFn) {
        for (const individual of population) {
            individual.fitness = await fitnessFn(individual.architecture);
        }
        return population.map(p => p.fitness);
    }

    _selectParents(population, fitnesses) {
        const parents = [];
        const tournamentSize = 3;

        for (let i = 0; i < this.config.populationSize * 0.5; i++) {
            const tournament = Array.from({ length: tournamentSize }, () => {
                const idx = Math.floor(Math.random() * population.length);
                return { individual: population[idx], fitness: fitnesses[idx] };
            });
            tournament.sort((a, b) => b.fitness - a.fitness);
            parents.push(tournament[0].individual);
        }
        return parents;
    }

    _crossover(parents) {
        const offspring = [];
        for (let i = 0; i < parents.length; i += 2) {
            if (i + 1 >= parents.length) break;
            offspring.push(this._crossoverArchitectures(parents[i], parents[i + 1]));
        }
        return offspring;
    }

    _crossoverArchitectures(arch1, arch2) {
        const comps1 = arch1.components ?? [];
        const comps2 = arch2.components ?? [];
        return {
            ...arch1,
            components: [
                ...comps1.slice(0, Math.floor(comps1.length / 2)),
                ...comps2.slice(Math.floor(comps2.length / 2))
            ]
        };
    }

    _mutate(offspring) {
        return offspring.map(individual => ({
            ...individual,
            architecture: this._mutateArchitecture(individual.architecture)
        }));
    }

    _mutateArchitecture(architecture) {
        return JSON.parse(JSON.stringify(architecture));
    }

    getState() {
        return {
            currentArchitecture: this.currentArchitecture,
            architectureHistory: this.architectureHistory.map(h => ({
                timestamp: h.timestamp,
                generation: h.generation,
                hasModification: !!h.modification
            })),
            performanceHistory: this.performanceHistory.slice(-100),
            successfulOperators: this.successfulOperators.length,
            failedOperators: this.failedOperators.length,
            metrics: { ...this.metrics }
        };
    }

    exportToMetta() {
        if (!this.config.useMettaRepresentation) return '';
        let metta = '(architecture\n';
        if (this.currentArchitecture?.components) {
            for (const c of this.currentArchitecture.components) {
                metta += `    (component ${c.id} ${c.type})\n`;
            }
        }
        return metta + ')';
    }

    async onShutdown() {
        await this.bridge?.shutdown();
        this.currentArchitecture = null;
        this.operatorPool = [];
    }
}
