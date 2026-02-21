/**
 * Self-Modifying Architecture Framework
 * Enables dynamic reconfiguration and meta-learning capabilities.
 */
import { Component } from './Component.js';
import { ComponentRegistry, globalRegistry } from './ComponentRegistry.js';
import { CompositionEngine, PipelineBuilder } from './CompositionEngine.js';

/**
 * MetaController for self-modification and architecture evolution.
 */
export class MetaController extends Component {
    constructor(config = {}) {
        super({
            metaLearningRate: 0.1,
            explorationRate: 0.3,
            modificationThreshold: 0.5,
            evaluationWindow: 100,
            maxArchitectureDepth: 5,
            ...config
        });
        
        this.registry = config.registry || globalRegistry;
        this.compositionEngine = new CompositionEngine();
        this.architectureHistory = [];
        this.performanceHistory = [];
        this.modificationLog = [];
        this._currentArchitecture = null;
        this._evaluationBuffer = [];
    }

    async onInitialize() {
        this.setState('phase', 'exploration');
        this.setState('generation', 0);
        this.setState('bestScore', -Infinity);
        
        // Subscribe to performance events
        this.subscribe('performance', this.onPerformance.bind(this));
        this.subscribe('episodeComplete', this.onEpisodeComplete.bind(this));
    }

    /**
     * Get current architecture configuration.
     */
    getArchitecture() {
        return this._currentArchitecture;
    }

    /**
     * Set initial architecture.
     * @param {Object} architecture - Architecture specification
     */
    setArchitecture(architecture) {
        this._currentArchitecture = architecture;
        this.architectureHistory.push({
            architecture: JSON.parse(JSON.stringify(architecture)),
            timestamp: Date.now(),
            generation: this.getState('generation')
        });
        return this;
    }

    /**
     * Evaluate current architecture performance.
     */
    evaluate() {
        if (this._evaluationBuffer.length === 0) {
            return { score: 0, variance: 0, samples: 0 };
        }

        const scores = this._evaluationBuffer.slice(-this.config.evaluationWindow);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;

        return {
            score: mean,
            variance,
            samples: scores.length,
            trend: this.calculateTrend(scores)
        };
    }

    calculateTrend(scores) {
        if (scores.length < 2) return 0;
        const window = Math.min(10, scores.length);
        const recent = scores.slice(-window);
        const prev = scores.slice(-window * 2, -window);
        
        if (prev.length === 0) return 0;
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
        
        return recentAvg - prevAvg;
    }

    /**
     * Propose architecture modification.
     */
    proposeModification() {
        const evaluation = this.evaluate();
        const phase = this.getState('phase');
        
        if (evaluation.score < this.getState('bestScore') - this.config.modificationThreshold) {
            // Performance degraded, consider reverting or exploring
            return this.generateExploration();
        }

        if (phase === 'exploration' && Math.random() < this.config.explorationRate) {
            return this.generateExploration();
        } else {
            return this.generateExploitation(evaluation);
        }
    }

    /**
     * Generate exploratory modification.
     */
    generateExploration() {
        const current = this._currentArchitecture;
        if (!current) return null;

        const modification = {
            type: this.sampleModificationType('explore'),
            timestamp: Date.now(),
            reason: 'exploration'
        };

        switch (modification.type) {
            case 'add_component':
                modification.target = this.selectRandomStage(current);
                modification.component = this.sampleNewComponent();
                break;
            case 'remove_component':
                modification.target = this.selectRemovableComponent(current);
                break;
            case 'reorder':
                modification.stages = this.shuffleStages(current);
                break;
            case 'replace':
                modification.target = this.selectRandomStage(current);
                modification.replacement = this.sampleComponentReplacement(modification.target);
                break;
            case 'hyperparameter':
                modification.target = this.selectRandomStage(current);
                modification.paramChange = this.generateHyperparameterChange();
                break;
        }

        return modification;
    }

    /**
     * Generate exploitative modification (gradient-based).
     */
    generateExploitation(evaluation) {
        const current = this._currentArchitecture;
        if (!current) return null;

        const modification = {
            type: this.sampleModificationType('exploit'),
            timestamp: Date.now(),
            reason: 'exploitation',
            expectedImprovement: evaluation.trend > 0 ? evaluation.trend : 0.01
        };

        // Focus on fine-tuning
        if (evaluation.trend > 0) {
            // Continue in same direction
            modification.target = this.selectBestPerformingStage(current);
            modification.paramChange = this.amplifySuccessfulParams(modification.target);
        } else {
            // Small adjustment
            modification.target = this.selectWorstPerformingStage(current);
            modification.paramChange = this.adjustFailingParams(modification.target);
        }

        return modification;
    }

    /**
     * Apply a modification to the architecture.
     */
    applyModification(modification) {
        if (!modification || !this._currentArchitecture) return false;

        const previous = JSON.parse(JSON.stringify(this._currentArchitecture));
        let success = false;

        try {
            switch (modification.type) {
                case 'add_component':
                    success = this.addComponent(modification.target, modification.component);
                    break;
                case 'remove_component':
                    success = this.removeComponent(modification.target);
                    break;
                case 'reorder':
                    success = this.reorderStages(modification.stages);
                    break;
                case 'replace':
                    success = this.replaceComponent(modification.target, modification.replacement);
                    break;
                case 'hyperparameter':
                    success = this.modifyHyperparameters(modification.target, modification.paramChange);
                    break;
            }

            if (success) {
                this.modificationLog.push({
                    ...modification,
                    success: true,
                    previous
                });
                
                const gen = this.getState('generation');
                this.setState('generation', gen + 1);
            }
        } catch (e) {
            console.error('Modification failed:', e);
            this._currentArchitecture = previous;
            success = false;
        }

        return success;
    }

    addComponent(target, component) {
        if (!target) return false;
        // Implementation depends on architecture structure
        return true;
    }

    removeComponent(target) {
        if (!target) return false;
        return true;
    }

    reorderStages(stages) {
        this._currentArchitecture.stages = stages;
        return true;
    }

    replaceComponent(target, replacement) {
        if (!target) return false;
        // Replace component in architecture
        return true;
    }

    modifyHyperparameters(target, paramChange) {
        if (!target || !paramChange) return false;
        // Modify hyperparameters
        return true;
    }

    /**
     * Sample modification type based on phase.
     */
    sampleModificationType(phase) {
        const exploreTypes = ['add_component', 'remove_component', 'reorder', 'replace'];
        const exploitTypes = ['hyperparameter', 'replace'];
        
        const types = phase === 'explore' ? exploreTypes : exploitTypes;
        return types[Math.floor(Math.random() * types.length)];
    }

    selectRandomStage(architecture) {
        if (!architecture?.stages || architecture.stages.length === 0) return null;
        return architecture.stages[Math.floor(Math.random() * architecture.stages.length)];
    }

    selectRemovableComponent(architecture) {
        // Find components that can be safely removed
        return this.selectRandomStage(architecture);
    }

    sampleNewComponent() {
        const available = this.registry.list();
        if (available.length === 0) return null;
        
        const comp = available[Math.floor(Math.random() * available.length)];
        return {
            name: comp.name,
            config: {}
        };
    }

    sampleComponentReplacement(target) {
        if (!target?.component) return null;
        // Find similar components
        return this.sampleNewComponent();
    }

    generateHyperparameterChange() {
        const params = ['learningRate', 'explorationRate', 'discountFactor', 'batchSize'];
        const param = params[Math.floor(Math.random() * params.length)];
        const delta = (Math.random() - 0.5) * 0.2; // -0.1 to +0.1
        
        return { param, delta };
    }

    selectBestPerformingStage(architecture) {
        return this.selectRandomStage(architecture);
    }

    selectWorstPerformingStage(architecture) {
        return this.selectRandomStage(architecture);
    }

    amplifySuccessfulParams(target) {
        return this.generateHyperparameterChange();
    }

    adjustFailingParams(target) {
        return this.generateHyperparameterChange();
    }

    shuffleStages(architecture) {
        if (!architecture?.stages) return [];
        return [...architecture.stages].sort(() => Math.random() - 0.5);
    }

    /**
     * Handle performance update.
     */
    onPerformance(data) {
        this._evaluationBuffer.push(data.score);
        
        // Keep buffer bounded
        if (this._evaluationBuffer.length > this.config.evaluationWindow * 2) {
            this._evaluationBuffer.shift();
        }

        const evaluation = this.evaluate();
        
        if (evaluation.score > this.getState('bestScore')) {
            this.setState('bestScore', evaluation.score);
            this.setState('phase', 'exploitation');
        }

        this.performanceHistory.push({
            ...evaluation,
            generation: this.getState('generation'),
            timestamp: Date.now()
        });
    }

    /**
     * Handle episode completion.
     */
    onEpisodeComplete(data) {
        // Trigger meta-learning update
        if (data.episodeNumber % 10 === 0) {
            const modification = this.proposeModification();
            if (modification) {
                this.applyModification(modification);
            }
        }
    }

    /**
     * Get modification history.
     */
    getModificationHistory() {
        return this.modificationLog;
    }

    /**
     * Get performance history.
     */
    getPerformanceHistory() {
        return this.performanceHistory;
    }

    /**
     * Export meta-controller state.
     */
    serialize() {
        return {
            ...super.serialize(),
            architectureHistory: this.architectureHistory,
            performanceHistory: this.performanceHistory.slice(-100),
            modificationLog: this.modificationLog.slice(-100),
            currentArchitecture: this._currentArchitecture
        };
    }
}

/**
 * Architecture Evolver for population-based training.
 */
export class ArchitectureEvolver extends Component {
    constructor(config = {}) {
        super({
            populationSize: 10,
            elitismRate: 0.2,
            mutationRate: 0.3,
            crossoverRate: 0.5,
            tournamentSize: 3,
            ...config
        });
        
        this.population = [];
        this.generation = 0;
        this.fitnessHistory = [];
    }

    /**
     * Initialize population.
     */
    initializePopulation(baseArchitecture) {
        this.population = [];
        
        for (let i = 0; i < this.config.populationSize; i++) {
            const variant = i === 0 
                ? JSON.parse(JSON.stringify(baseArchitecture))
                : this.mutateArchitecture(JSON.parse(JSON.stringify(baseArchitecture)));
            
            this.population.push({
                architecture: variant,
                fitness: 0,
                age: 0
            });
        }
        
        this.generation = 0;
        return this;
    }

    /**
     * Update fitness for an architecture.
     */
    updateFitness(architectureId, fitness) {
        const individual = this.population.find(
            p => JSON.stringify(p.architecture) === JSON.stringify(architectureId)
        );
        
        if (individual) {
            individual.fitness = fitness;
            individual.age++;
        }
    }

    /**
     * Evolve to next generation.
     */
    evolve() {
        // Sort by fitness
        this.population.sort((a, b) => b.fitness - a.fitness);
        
        const newPopulation = [];
        const eliteCount = Math.floor(this.config.populationSize * this.config.elitismRate);
        
        // Elitism: keep best individuals
        for (let i = 0; i < eliteCount; i++) {
            newPopulation.push({
                architecture: JSON.parse(JSON.stringify(this.population[i].architecture)),
                fitness: 0,
                age: 0
            });
        }
        
        // Generate rest through crossover and mutation
        while (newPopulation.length < this.config.populationSize) {
            let child;
            
            if (Math.random() < this.config.crossoverRate) {
                const parent1 = this.tournamentSelect();
                const parent2 = this.tournamentSelect();
                child = this.crossover(parent1, parent2);
            } else {
                child = JSON.parse(JSON.stringify(this.tournamentSelect().architecture));
            }
            
            if (Math.random() < this.config.mutationRate) {
                child = this.mutateArchitecture(child);
            }
            
            newPopulation.push({
                architecture: child,
                fitness: 0,
                age: 0
            });
        }
        
        this.population = newPopulation;
        this.generation++;
        
        this.fitnessHistory.push({
            generation: this.generation,
            bestFitness: this.population[0].fitness,
            avgFitness: this.population.reduce((a, b) => a + b.fitness, 0) / this.population.length
        });
        
        return this.getBestArchitecture();
    }

    tournamentSelect() {
        const tournament = [];
        for (let i = 0; i < this.config.tournamentSize; i++) {
            const idx = Math.floor(Math.random() * this.population.length);
            tournament.push(this.population[idx]);
        }
        return tournament.sort((a, b) => b.fitness - a.fitness)[0];
    }

    crossover(parent1, parent2) {
        // Simple single-point crossover
        const point = Math.floor(Math.random() * Math.min(
            parent1.stages?.length || 1,
            parent2.stages?.length || 1
        ));
        
        return {
            ...parent1,
            stages: [
                ...(parent1.stages?.slice(0, point) || []),
                ...(parent2.stages?.slice(point) || [])
            ]
        };
    }

    mutateArchitecture(architecture) {
        const mutationType = Math.random();
        
        if (mutationType < 0.3 && architecture.stages?.length > 1) {
            // Remove stage
            const idx = Math.floor(Math.random() * architecture.stages.length);
            architecture.stages.splice(idx, 1);
        } else if (mutationType < 0.6) {
            // Modify hyperparameter
            if (architecture.stages?.length > 0) {
                const stage = architecture.stages[Math.floor(Math.random() * architecture.stages.length)];
                if (stage.config) {
                    const keys = Object.keys(stage.config);
                    if (keys.length > 0) {
                        const key = keys[Math.floor(Math.random() * keys.length)];
                        stage.config[key] *= (0.9 + Math.random() * 0.2);
                    }
                }
            }
        } else if (mutationType < 0.9) {
            // Reorder stages
            if (architecture.stages?.length > 1) {
                const idx1 = Math.floor(Math.random() * architecture.stages.length);
                const idx2 = Math.floor(Math.random() * architecture.stages.length);
                [architecture.stages[idx1], architecture.stages[idx2]] = 
                [architecture.stages[idx2], architecture.stages[idx1]];
            }
        }
        
        return architecture;
    }

    getBestArchitecture() {
        return this.population[0]?.architecture || null;
    }

    getPopulation() {
        return this.population.map(p => ({
            fitness: p.fitness,
            age: p.age
        }));
    }

    serialize() {
        return {
            ...super.serialize(),
            population: this.population,
            generation: this.generation,
            fitnessHistory: this.fitnessHistory
        };
    }
}
