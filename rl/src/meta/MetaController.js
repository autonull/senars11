/**
 * Meta-Controller for Self-Modifying Architectures
 * 
 * Enables architectures that evolve and adapt during learning through
 * component selection, hyperparameter tuning, and structural modification.
 */
import { Component } from '../composable/Component.js';
import { ComponentRegistry } from '../composable/ComponentRegistry.js';
import { CompositionEngine } from '../composable/CompositionEngine.js';
import { NeuroSymbolicBridge } from '../bridges/NeuroSymbolicBridge.js';
import { TensorLogicPolicy } from '../policies/TensorLogicPolicy.js';

/**
 * Architecture modification operator
 */
export class ModificationOperator {
    constructor(config = {}) {
        this.type = config.type || 'unknown'; // add, remove, replace, modify, connect
        this.target = config.target || null; // Component or stage ID
        this.parameters = config.parameters || {};
        this.priority = config.priority || 1.0;
        this.expectedImprovement = config.expectedImprovement || 0;
        this.applied = config.applied || false;
        this.successful = config.successful || null;
    }

    /**
     * Apply modification to architecture
     */
    async apply(architecture, context = {}) {
        switch (this.type) {
            case 'add':
                return this._addComponent(architecture, context);
            case 'remove':
                return this._removeComponent(architecture, context);
            case 'replace':
                return this._replaceComponent(architecture, context);
            case 'modify':
                return this._modifyComponent(architecture, context);
            case 'connect':
                return this._connectComponents(architecture, context);
            case 'disconnect':
                return this._disconnectComponents(architecture, context);
            default:
                throw new Error(`Unknown modification type: ${this.type}`);
        }
    }

    async _addComponent(architecture, context) {
        const { componentId, stage, position } = this.parameters;
        
        const registry = ComponentRegistry.getInstance();
        const component = registry.create(componentId, this.parameters.config);
        
        if (stage) {
            architecture.addToStage(stage, component, position);
        } else {
            architecture.addComponent(component);
        }

        return { success: true, component };
    }

    async _removeComponent(architecture, context) {
        const { componentId } = this.parameters;
        
        const component = architecture.getComponent(componentId);
        if (component) {
            await component.shutdown();
            architecture.removeComponent(componentId);
            return { success: true, component };
        }

        return { success: false, error: 'Component not found' };
    }

    async _replaceComponent(architecture, context) {
        const { oldComponentId, newComponentId, config } = this.parameters;
        
        const registry = ComponentRegistry.getInstance();
        const newComponent = registry.create(newComponentId, config || {});
        
        const result = architecture.replaceComponent(oldComponentId, newComponent);
        
        if (result.success) {
            return { success: true, oldComponent: result.old, newComponent };
        }

        return result;
    }

    async _modifyComponent(architecture, context) {
        const { componentId, config, method, args } = this.parameters;
        
        const component = architecture.getComponent(componentId);
        if (!component) {
            return { success: false, error: 'Component not found' };
        }

        // Update configuration
        if (config) {
            Object.assign(component.config, config);
        }

        // Call method if specified
        if (method && typeof component[method] === 'function') {
            const result = await component[method](...(args || []));
            return { success: true, result };
        }

        return { success: true, component };
    }

    async _connectComponents(architecture, context) {
        const { fromId, fromOutput, toId, toInput } = this.parameters;
        
        architecture.connect(fromId, fromOutput, toId, toInput);
        
        return { success: true };
    }

    async _disconnectComponents(architecture, context) {
        const { fromId, toId } = this.parameters;
        
        architecture.disconnect(fromId, toId);
        
        return { success: true };
    }

    /**
     * Serialize operator
     */
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

    /**
     * Deserialize operator
     */
    static fromJSON(json) {
        return new ModificationOperator(json);
    }
}

/**
 * Meta-Controller for self-modifying architectures
 */
export class MetaController extends Component {
    constructor(config = {}) {
        super({
            // Meta-learning settings
            metaLearningRate: config.metaLearningRate ?? 0.1,
            explorationRate: config.explorationRate ?? 0.3,
            modificationThreshold: config.modificationThreshold ?? 0.5,
            evaluationWindow: config.evaluationWindow ?? 100,
            
            // Architecture search
            populationSize: config.populationSize ?? 10,
            elitismRate: config.elitismRate ?? 0.2,
            mutationRate: config.mutationRate ?? 0.3,
            crossoverRate: config.crossoverRate ?? 0.5,
            
            // Imagination-based evaluation
            useImagination: config.useImagination ?? true,
            imaginationHorizon: config.imaginationHorizon ?? 10,
            
            // Neuro-symbolic integration
            useNARSReasoning: config.useNARSReasoning ?? true,
            useMettaRepresentation: config.useMettaRepresentation ?? true,
            
            ...config
        });

        // Architecture state
        this.currentArchitecture = null;
        this.architectureHistory = [];
        this.performanceHistory = [];
        
        // Modification operators
        this.operatorPool = [];
        this.successfulOperators = [];
        this.failedOperators = [];
        
        // Evaluation
        this.evaluationBuffer = [];
        this.baselinePerformance = null;
        
        // Neuro-symbolic bridge
        this.bridge = null;
        
        // Composition engine
        this.compositionEngine = new CompositionEngine();
        
        // Metrics
        this.metrics = {
            modificationsProposed: 0,
            modificationsApplied: 0,
            modificationsSuccessful: 0,
            architectureGenerations: 0
        };
    }

    async onInitialize() {
        // Initialize neuro-symbolic bridge
        this.bridge = new NeuroSymbolicBridge({
            senarsConfig: this.config.senarsConfig,
            mettaConfig: this.config.mettaConfig
        });
        await this.bridge.initialize();

        // Initialize operator pool with common modifications
        this._initializeOperatorPool();

        this.emit('initialized', {
            operators: this.operatorPool.length,
            imagination: this.config.useImagination
        });
    }

    _initializeOperatorPool() {
        // Common modification operators
        const commonOperators = [
            // Add component operators
            new ModificationOperator({
                type: 'add',
                parameters: { stage: 'perception', componentId: 'attention' }
            }),
            new ModificationOperator({
                type: 'add',
                parameters: { stage: 'reasoning', componentId: 'causal_reasoner' }
            }),
            new ModificationOperator({
                type: 'add',
                parameters: { stage: 'action', componentId: 'uncertainty_estimator' }
            }),

            // Modify hyperparameters
            new ModificationOperator({
                type: 'modify',
                parameters: { 
                    componentId: 'policy',
                    config: { learningRate: 0.001 }
                }
            }),
            new ModificationOperator({
                type: 'modify',
                parameters: { 
                    componentId: 'policy',
                    config: { hiddenDim: 128 }
                }
            }),

            // Connection operators
            new ModificationOperator({
                type: 'connect',
                parameters: { 
                    fromId: 'perception',
                    fromOutput: 'features',
                    toId: 'reasoning',
                    toInput: 'symbols'
                }
            })
        ];

        this.operatorPool = commonOperators;
    }

    // =========================================================================
    // Architecture Management
    // =========================================================================

    /**
     * Set initial architecture
     */
    setArchitecture(architecture) {
        this.currentArchitecture = architecture;
        this.architectureHistory.push({
            architecture,
            timestamp: Date.now(),
            generation: 0
        });
        this.baselinePerformance = null;
    }

    /**
     * Get current architecture
     */
    getArchitecture() {
        return this.currentArchitecture;
    }

    /**
     * Evaluate architecture performance
     */
    async evaluatePerformance(performance) {
        this.evaluationBuffer.push({
            performance,
            timestamp: Date.now(),
            architecture: this.currentArchitecture
        });

        // Update performance history
        this.performanceHistory.push({
            value: performance,
            timestamp: Date.now(),
            architectureId: this.architectureHistory.length - 1
        });

        // Keep only recent window
        if (this.evaluationBuffer.length > this.config.evaluationWindow) {
            this.evaluationBuffer.shift();
        }

        // Update baseline
        if (this.performanceHistory.length >= this.config.evaluationWindow) {
            const recent = this.performanceHistory.slice(-this.config.evaluationWindow);
            this.baselinePerformance = recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
        }

        // Check if modification needed
        if (this._shouldModifyArchitecture(performance)) {
            const modification = await this.proposeModification();
            if (modification) {
                return await this.applyModification(modification);
            }
        }

        return { modified: false };
    }

    _shouldModifyArchitecture(currentPerformance) {
        if (!this.baselinePerformance) return false;

        // Modify if performance is below baseline
        const improvement = (currentPerformance - this.baselinePerformance) / 
                           (Math.abs(this.baselinePerformance) + 1e-6);

        return improvement < -this.config.modificationThreshold;
    }

    // =========================================================================
    // Modification Proposal
    // =========================================================================

    /**
     * Propose architecture modification
     */
    async proposeModification() {
        this.metrics.modificationsProposed++;

        // Generate candidates
        const candidates = await this._generateModificationCandidates();

        if (candidates.length === 0) {
            return null;
        }

        // Evaluate candidates
        let evaluated;
        if (this.config.useImagination) {
            evaluated = await this._evaluateInImagination(candidates);
        } else {
            evaluated = await this._evaluateWithHeuristics(candidates);
        }

        // Select best candidate
        const best = evaluated.reduce((max, c) => 
            c.expectedImprovement > max.expectedImprovement ? c : max
        , evaluated[0]);

        // Apply exploration
        if (Math.random() < this.config.explorationRate) {
            const random = evaluated[Math.floor(Math.random() * evaluated.length)];
            return random;
        }

        return best;
    }

    async _generateModificationCandidates() {
        const candidates = [];

        // Use existing operators
        for (const operator of this.operatorPool) {
            const candidate = new ModificationOperator({
                ...operator,
                priority: this._computeOperatorPriority(operator)
            });
            candidates.push(candidate);
        }

        // Generate new operators using NARS reasoning
        if (this.config.useNARSReasoning && this.bridge?.senarsBridge) {
            const narsOperators = await this._generateNARSOperators();
            candidates.push(...narsOperators);
        }

        // Generate operators using MeTTa
        if (this.config.useMettaRepresentation && this.bridge?.metta) {
            const mettaOperators = await this._generateMettaOperators();
            candidates.push(...mettaOperators);
        }

        return candidates;
    }

    _computeOperatorPriority(operator) {
        // Base priority
        let priority = operator.priority;

        // Boost successful operators
        const successRate = this.successfulOperators.filter(
            o => o.type === operator.type
        ).length / (this.successfulOperators.length + 1);

        priority *= (1 + successRate);

        // Penalize failed operators
        const failRate = this.failedOperators.filter(
            o => o.type === operator.type
        ).length / (this.failedOperators.length + 1);

        priority *= (1 - failRate * 0.5);

        return priority;
    }

    async _generateNARSOperators() {
        if (!this.bridge?.senarsBridge) return [];

        // Query NARS for improvement suggestions
        const query = '<(?modification) --> architecture_improvement>?';
        const result = await this.bridge.askNarsese(query, { cycles: 50 });

        if (!result || !result.substitution) return [];

        // Parse NARS result into operators
        const operators = [];
        const modification = result.substitution['?modification'];

        if (modification) {
            // Convert NARS conclusion to modification operator
            operators.push(new ModificationOperator({
                type: 'modify',
                target: modification.toString(),
                parameters: {
                    componentId: modification.toString(),
                    config: { priority: result.truth?.confidence || 0.5 }
                }
            }));
        }

        return operators;
    }

    async _generateMettaOperators() {
        if (!this.bridge?.metta) return [];

        // MeTTa program for generating modifications
        const program = `
            (generate-modifications
                (current-architecture)
                (performance-history)
                (modification-operators)
            )
        `;

        const result = await this.bridge.executeMetta(program);
        
        if (!result.success || !result.result) return [];

        // Parse MeTTa result into operators
        // This is simplified - real implementation would parse MeTTa atoms
        return [];
    }

    async _evaluateInImagination(candidates) {
        const evaluated = [];

        for (const candidate of candidates) {
            // Create imagined architecture
            const imaginedArch = this._createImaginedArchitecture(candidate);
            
            // Simulate performance in world model
            const imaginedPerformance = await this._simulatePerformance(imaginedArch);
            
            // Compute expected improvement
            const expectedImprovement = this._computeExpectedImprovement(
                imaginedPerformance,
                this.baselinePerformance
            );

            evaluated.push({
                ...candidate,
                expectedImprovement,
                imaginedPerformance
            });
        }

        return evaluated;
    }

    async _evaluateWithHeuristics(candidates) {
        const evaluated = [];

        for (const candidate of candidates) {
            // Simple heuristic evaluation
            let score = candidate.priority;

            // Consider modification type
            switch (candidate.type) {
                case 'add':
                    score *= 1.2; // Slightly prefer adding
                    break;
                case 'remove':
                    score *= 0.8; // Slightly penalize removing
                    break;
                case 'modify':
                    score *= 1.0; // Neutral
                    break;
            }

            // Consider target component
            if (candidate.target) {
                const component = this.currentArchitecture?.getComponent(candidate.target);
                if (component && component.metrics) {
                    // Boost modifications to underperforming components
                    if (component.metrics.errorRate > 0.5) {
                        score *= 1.5;
                    }
                }
            }

            evaluated.push({
                ...candidate,
                expectedImprovement: score * 0.1 // Scale to reasonable range
            });
        }

        return evaluated;
    }

    _createImaginedArchitecture(modification) {
        // Deep clone current architecture
        const imagined = JSON.parse(JSON.stringify(this.currentArchitecture));
        
        // Apply modification
        // In real implementation, this would create actual component instances
        
        return imagined;
    }

    async _simulatePerformance(architecture) {
        // Use world model to simulate trajectories
        if (!this.bridge) return 0;

        let totalReward = 0;
        const horizon = this.config.imaginationHorizon;

        for (let step = 0; step < horizon; step++) {
            // Simulate one step in imagination
            // In real implementation, this would use the world model
            
            const imaginedReward = Math.random() * 2 - 1; // Placeholder
            totalReward += imaginedReward;
        }

        return totalReward / horizon;
    }

    _computeExpectedImprovement(imaginedPerformance, baseline) {
        if (!baseline) return imaginedPerformance * 0.1;
        
        return (imaginedPerformance - baseline) / (Math.abs(baseline) + 1e-6);
    }

    // =========================================================================
    // Modification Application
    // =========================================================================

    /**
     * Apply modification to architecture
     */
    async applyModification(modification) {
        if (!this.currentArchitecture) {
            return { success: false, error: 'No architecture set' };
        }

        try {
            // Apply modification
            const result = await modification.apply(this.currentArchitecture);

            if (result.success) {
                modification.applied = true;
                this.metrics.modificationsApplied++;

                // Store in history
                this.architectureHistory.push({
                    architecture: this.currentArchitecture,
                    modification,
                    timestamp: Date.now(),
                    generation: this.architectureHistory.length
                });

                return { 
                    success: true, 
                    modification,
                    newArchitecture: this.currentArchitecture
                };
            }

            return result;
        } catch (e) {
            modification.successful = false;
            this.failedOperators.push(modification);
            
            return { success: false, error: e.message };
        }
    }

    /**
     * Record modification outcome
     */
    recordOutcome(modification, success, performance) {
        modification.successful = success;

        if (success) {
            this.successfulOperators.push(modification);
            this.metrics.modificationsSuccessful++;
        } else {
            this.failedOperators.push(modification);
        }

        // Update operator pool priorities
        this._updateOperatorPriorities(success);
    }

    _updateOperatorPriorities(success) {
        const factor = success ? 1.1 : 0.9;

        for (const operator of this.operatorPool) {
            if (operator.applied) {
                operator.priority *= factor;
            }
        }
    }

    // =========================================================================
    // Population-Based Search
    // =========================================================================

    /**
     * Evolve architecture using population-based search
     */
    async evolveArchitecture(generations = 10, options = {}) {
        const { 
            fitnessFn,
            parallel = true 
        } = options;

        // Initialize population
        const population = this._initializePopulation();

        for (let gen = 0; gen < generations; gen++) {
            // Evaluate fitness
            const fitnesses = await this._evaluatePopulation(population, fitnessFn, parallel);

            // Selection
            const parents = this._selectParents(population, fitnesses);

            // Crossover
            const offspring = this._crossover(parents);

            // Mutation
            const mutated = this._mutate(offspring);

            // Elitism
            population.splice(0, mutated.length, ...mutated);
        }

        // Return best architecture
        const best = population.reduce((max, arch) => 
            arch.fitness > max.fitness ? arch : max
        , population[0]);

        this.metrics.architectureGenerations++;

        return best.architecture;
    }

    _initializePopulation() {
        const population = [];

        // Add current architecture
        population.push({
            architecture: this.currentArchitecture,
            fitness: 0,
            generation: 0
        });

        // Generate variants
        for (let i = 1; i < this.config.populationSize; i++) {
            const variant = this._mutateArchitecture(this.currentArchitecture);
            population.push({
                architecture: variant,
                fitness: 0,
                generation: 0
            });
        }

        return population;
    }

    async _evaluatePopulation(population, fitnessFn, parallel) {
        const fitnesses = [];

        for (const individual of population) {
            const fitness = await fitnessFn(individual.architecture);
            individual.fitness = fitness;
            fitnesses.push(fitness);
        }

        return fitnesses;
    }

    _selectParents(population, fitnesses) {
        // Tournament selection
        const parents = [];
        const tournamentSize = 3;

        for (let i = 0; i < this.config.populationSize * 0.5; i++) {
            const tournament = [];
            for (let j = 0; j < tournamentSize; j++) {
                const idx = Math.floor(Math.random() * population.length);
                tournament.push({ 
                    individual: population[idx], 
                    fitness: fitnesses[idx] 
                });
            }

            tournament.sort((a, b) => b.fitness - a.fitness);
            parents.push(tournament[0].individual);
        }

        return parents;
    }

    _crossover(parents) {
        const offspring = [];

        for (let i = 0; i < parents.length; i += 2) {
            if (i + 1 >= parents.length) break;

            const parent1 = parents[i];
            const parent2 = parents[i + 1];

            // Single-point crossover on architecture components
            const child = this._crossoverArchitectures(parent1, parent2);
            offspring.push(child);
        }

        return offspring;
    }

    _crossoverArchitectures(arch1, arch2) {
        // Simplified crossover - real implementation would merge component graphs
        return {
            ...arch1,
            components: [
                ...(arch1.components || []).slice(0, Math.floor((arch1.components || []).length / 2)),
                ...(arch2.components || []).slice(Math.floor((arch2.components || []).length / 2))
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
        // Apply random modification
        const operator = this.operatorPool[
            Math.floor(Math.random() * this.operatorPool.length)
        ];

        // Clone and modify
        const mutated = JSON.parse(JSON.stringify(architecture));
        
        // In real implementation, would apply actual modification
        
        return mutated;
    }

    // =========================================================================
    // State Management
    // =========================================================================

    /**
     * Get meta-controller state
     */
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

    /**
     * Export architecture to MeTTa
     */
    exportToMetta() {
        if (!this.config.useMettaRepresentation) return '';

        let metta = '(architecture\n';
        
        if (this.currentArchitecture?.components) {
            for (const component of this.currentArchitecture.components) {
                metta += `    (component ${component.id} ${component.type})\n`;
            }
        }

        metta += ')';
        return metta;
    }

    async onShutdown() {
        await this.bridge?.shutdown();
        this.currentArchitecture = null;
        this.operatorPool = [];
    }
}

/**
 * Factory for creating specialized meta-controllers
 */
export class MetaControllerFactory {
    /**
     * Create meta-controller for architecture search
     */
    static createArchitectureSearch(config = {}) {
        return new MetaController({
            ...config,
            populationSize: 20,
            mutationRate: 0.5,
            crossoverRate: 0.7,
            useImagination: true
        });
    }

    /**
     * Create meta-controller for hyperparameter tuning
     */
    static createHyperparameterTuner(config = {}) {
        return new MetaController({
            ...config,
            modificationThreshold: 0.2,
            explorationRate: 0.1,
            useImagination: false
        });
    }

    /**
     * Create meta-controller for component selection
     */
    static createComponentSelector(config = {}) {
        return new MetaController({
            ...config,
            useNARSReasoning: true,
            useMettaRepresentation: true,
            modificationThreshold: 0.3
        });
    }

    /**
     * Create minimal meta-controller
     */
    static createMinimal(config = {}) {
        return new MetaController({
            ...config,
            populationSize: 5,
            useImagination: false,
            useNARSReasoning: false,
            useMettaRepresentation: false
        });
    }
}
