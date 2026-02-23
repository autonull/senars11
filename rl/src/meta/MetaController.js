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
    async add(architecture, params) {
        const { componentId, stage, position } = params;
        const component = ComponentRegistry.getInstance().create(componentId, params.config ?? {});
        stage ? architecture.addToStage(stage, component, position) : architecture.addComponent(component);
        return { success: true, component };
    },

    async remove(architecture, params) {
        const { componentId } = params;
        const component = architecture.getComponent(componentId);
        if (component) {
            await component.shutdown();
            architecture.removeComponent(componentId);
            return { success: true, component };
        }
        return { success: false, error: 'Component not found' };
    },

    async replace(architecture, params) {
        const { oldComponentId, newComponentId, config } = params;
        const newComponent = ComponentRegistry.getInstance().create(newComponentId, config ?? {});
        const result = architecture.replaceComponent(oldComponentId, newComponent);
        return result.success ? { success: true, oldComponent: result.old, newComponent } : result;
    },

    async modify(architecture, params) {
        const { componentId, config, method, args } = params;
        const component = architecture.getComponent(componentId);
        if (!component) return { success: false, error: 'Component not found' };

        if (config) Object.assign(component.config, config);
        if (method && typeof component[method] === 'function') {
            const result = await component[method](...(args ?? []));
            return { success: true, result };
        }

        return { success: true, component };
    },

    async connect(architecture, params) {
        const { fromId, fromOutput, toId, toInput } = params;
        architecture.connect(fromId, fromOutput, toId, toInput);
        return { success: true };
    },

    async disconnect(architecture, params) {
        const { fromId, toId } = params;
        architecture.disconnect(fromId, toId);
        return { success: true };
    }
};

export class ModificationOperator {
    constructor(config = {}) {
        this.type = config.type ?? 'unknown';
        this.target = config.target ?? null;
        this.parameters = config.parameters ?? {};
        this.priority = config.priority ?? 1.0;
        this.expectedImprovement = config.expectedImprovement ?? 0;
        this.applied = config.applied ?? false;
        this.successful = config.successful ?? null;
    }

    async apply(architecture, context = {}) {
        const executor = ModificationExecutor[this.type];
        if (!executor) {
            return { success: false, error: `Unknown type: ${this.type}` };
        }
        return executor(architecture, this.parameters, context);
    }

    toJSON() {
        return {
            type: this.type,
            target: this.target,
            parameters: { ...this.parameters },
            priority: this.priority,
            expectedImprovement: this.expectedImprovement,
            applied: this.applied,
            successful: this.successful
        };
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
                // Dynamically import MeTTa interpreter if available
                const { MeTTaInterpreter } = await import('@senars/metta/src/MeTTaInterpreter.js');
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
        this.evaluationBuffer.push({ performance, timestamp: Date.now(), architecture: this.currentArchitecture });
        this.performanceHistory.push({ value: performance, timestamp: Date.now(), architectureId: this.architectureHistory.length - 1 });

        if (this.evaluationBuffer.length > this.config.evaluationWindow) {
            this.evaluationBuffer.shift();
        }

        if (this.performanceHistory.length >= this.config.evaluationWindow) {
            const recent = this.performanceHistory.slice(-this.config.evaluationWindow);
            this.baselinePerformance = recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
        }

        if (this._shouldModifyArchitecture(performance)) {
            const modification = await this.proposeModification();
            if (modification) {
                return this.applyModification(modification);
            }
        }

        // Periodic self-optimization
        if (this.metrics.modificationsApplied % 10 === 0) {
            await this.optimizeHyperparameters();
        }

        return { modified: false };
    }

    async optimizeHyperparameters() {
        if (!this.bridge?.metta) return;

        try {
            // Load script if needed
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

            // Execute optimization
            const { grounded, exp, sym } = await import('@senars/metta/src/kernel/Term.js');
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
        const successRate = this.successfulOperators.filter(o => o.type === operator.type).length / (this.successfulOperators.length + 1);
        const failRate = this.failedOperators.filter(o => o.type === operator.type).length / (this.failedOperators.length + 1);
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
            // Load the strategy script if not already loaded (simple memoization)
            if (!this._mettaScriptLoaded) {
                // Dynamically import fs to read the file
                const fs = await import('fs');
                const path = await import('path');
                const scriptPath = path.resolve('rl/src/meta/strategies/architecture_search.metta');

                if (fs.existsSync(scriptPath)) {
                    const script = fs.readFileSync(scriptPath, 'utf-8');
                    await this.bridge.metta.run(script);
                    this._mettaScriptLoaded = true;
                } else {
                    console.warn(`MeTTa strategy script not found: ${scriptPath}`);
                    return [];
                }
            }

            // Execute the strategy using reflection
            const { grounded, exp, sym } = await import('@senars/metta/src/kernel/Term.js');

            // Pass the controller as a grounded atom
            const controllerAtom = grounded(this);

            // Construct the expression: (generate-modifications $controller)
            const expr = exp(sym('generate-modifications'), [controllerAtom]);

            // Evaluate the expression directly
            const result = await this.bridge.metta.evaluateAsync(expr);

            if (result) {
                // Evaluate returns a single result or array?
                // MeTTa reduce usually returns an array of results for ND.
                // evaluateAsync calls reduceNDAsync which returns array.
                // But the result might be wrapped in a list if the function returns a list?
                // My function returns a single grounded object.

                const results = Array.isArray(result) ? result : [result];
                // Result should be a list of grounded objects (plain JS objects representing operators)
                // Need to unwrap them and convert to ModificationOperator instances

                const operators = [];
                for (const atom of result) {
                    if (atom.type === 'grounded' && atom.value) {
                        // It's a JS object returned from MeTTa
                        const opData = atom.value;
                        if (opData.type && opData.parameters) {
                            operators.push(new ModificationOperator({
                                type: opData.type,
                                parameters: opData.parameters,
                                priority: opData.priority || 1.0
                            }));
                        }
                    } else if (atom.type === 'compound' && atom.operator && atom.operator.name === 'make-operator') {
                        // Handle compound MeTTa structures if needed
                    }
                }
                return operators;
            }

        } catch (e) {
            console.error('Error generating MeTTa operators:', e);
        }

        return [];
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
            let score = candidate.priority;
            score *= TypeMultipliers[candidate.type] ?? 1.0;

            if (candidate.target) {
                const component = this.currentArchitecture?.getComponent(candidate.target);
                if (component?.metrics?.errorRate > 0.5) {
                    score *= 1.5;
                }
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
        if (!this.currentArchitecture) {
            return { success: false, error: 'No architecture set' };
        }

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
        this.operatorPool.forEach(operator => {
            if (operator.applied) {
                operator.priority *= factor;
            }
        });
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
        return {
            ...arch1,
            components: [
                ...(arch1.components ?? []).slice(0, Math.floor((arch1.components ?? []).length / 2)),
                ...(arch2.components ?? []).slice(Math.floor((arch2.components ?? []).length / 2))
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
        const operator = this.operatorPool[Math.floor(Math.random() * this.operatorPool.length)];
        const mutated = JSON.parse(JSON.stringify(architecture));
        return mutated;
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
            this.currentArchitecture.components.forEach(component => {
                metta += `    (component ${component.id} ${component.type})\n`;
            });
        }
        return metta + ')';
    }

    async onShutdown() {
        await this.bridge?.shutdown();
        this.currentArchitecture = null;
        this.operatorPool = [];
    }

    static createArchitectureSearch(config = {}) {
        return new MetaController({ ...config, populationSize: 20, mutationRate: 0.5, crossoverRate: 0.7, useImagination: true });
    }

    static createHyperparameterTuner(config = {}) {
        return new MetaController({ ...config, modificationThreshold: 0.2, explorationRate: 0.1, useImagination: false });
    }

    static createComponentSelector(config = {}) {
        return new MetaController({ ...config, useNARSReasoning: true, useMettaRepresentation: true, modificationThreshold: 0.3 });
    }

    static createMinimal(config = {}) {
        return new MetaController({ ...config, populationSize: 5, useImagination: false, useNARSReasoning: false, useMettaRepresentation: false });
    }
}
