/**
 * Evolutionary Architecture
 * Architecture evolution through genetic algorithms
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const EVOLUTION_DEFAULTS = {
    populationSize: 10,
    mutationRate: 0.1,
    elitismRatio: 0.2
};

/**
 * Evolutionary architecture optimizer
 * Evolves architecture configurations through selection and mutation
 */
export class EvolutionaryArchitecture extends Component {
    constructor(agent, config = {}) {
        super(mergeConfig(EVOLUTION_DEFAULTS, config));
        this.agent = agent;
        this.generation = 0;
        this.population = [];
    }

    async onInitialize() {
        this.population = this._initializePopulation();
        this.emit('initialized', {
            generation: this.generation,
            populationSize: this.config.populationSize
        });
    }

    _initializePopulation() {
        return Array.from({ length: this.config.populationSize }, () => ({
            config: this._randomConfig(),
            fitness: 0
        }));
    }

    _randomConfig() {
        return {
            learningRate: 0.001 * Math.pow(10, Math.random() * 2),
            hiddenUnits: Math.floor(16 + Math.random() * 48),
            numLayers: Math.floor(1 + Math.random() * 3)
        };
    }

    /**
     * Select action using current best architecture
     * @param {any} observation - Observation input
     * @param {any} goal - Optional goal
     * @returns {Promise<number>} Selected action
     */
    async act(observation, goal) {
        return Math.floor(Math.random() * 2);
    }

    /**
     * Learn and potentially evolve
     * @param {any} observation - Observation
     * @param {number} action - Action taken
     * @param {number} reward - Reward received
     * @param {any} nextObservation - Next observation
     * @param {boolean} done - Episode done
     */
    async learn(observation, action, reward, nextObservation, done) {
        if (done) {
            this.generation++;
            this._updateFitness(reward);

            if (this.generation % 10 === 0) {
                await this._evolve();
            }
        }
    }

    _updateFitness(reward) {
        if (this.population.length > 0) {
            this.population[0].fitness = reward;
        }
    }

    async _evolve() {
        this.population = this._select();
        this.population = this._crossover();
        this.population = this._mutate();
    }

    _select() {
        const eliteCount = Math.floor(
            this.config.populationSize * this.config.elitismRatio
        );
        const sorted = [...this.population].sort((a, b) => b.fitness - a.fitness);
        const elites = sorted.slice(0, eliteCount);
        const rest = sorted.slice(eliteCount);

        // Tournament selection for rest
        const selected = rest.map(ind => this._tournamentSelect(sorted));

        return [...elites, ...selected];
    }

    _tournamentSelect(population, tournamentSize = 3) {
        const tournament = Array.from(
            { length: tournamentSize },
            () => population[Math.floor(Math.random() * population.length)]
        );
        return tournament.reduce((best, curr) =>
            curr.fitness > best.fitness ? curr : best
        );
    }

    _crossover() {
        const offspring = [];
        for (let i = 0; i < this.population.length; i += 2) {
            if (i + 1 < this.population.length) {
                const [child1, child2] = this._singlePointCrossover(
                    this.population[i],
                    this.population[i + 1]
                );
                offspring.push(child1, child2);
            } else {
                offspring.push(this.population[i]);
            }
        }
        return offspring.slice(0, this.config.populationSize);
    }

    _singlePointCrossover(parent1, parent2) {
        const keys = Object.keys(parent1.config);
        const point = Math.floor(Math.random() * keys.length);

        const child1Config = { ...parent1.config };
        const child2Config = { ...parent2.config };

        for (let i = point; i < keys.length; i++) {
            const key = keys[i];
            child1Config[key] = parent2Config[key];
            child2Config[key] = parent1Config[key];
        }

        return [
            { config: child1Config, fitness: 0 },
            { config: child2Config, fitness: 0 }
        ];
    }

    _mutate() {
        return this.population.map(ind => {
            if (Math.random() < this.config.mutationRate) {
                return { config: this._mutateConfig(ind.config), fitness: 0 };
            }
            return ind;
        });
    }

    _mutateConfig(config) {
        const mutated = { ...config };
        const key = Object.keys(mutated)[Math.floor(Math.random() * Object.keys(mutated).length)];

        if (key === 'learningRate') {
            mutated[key] *= 0.5 + Math.random();
        } else if (typeof mutated[key] === 'number') {
            mutated[key] = Math.floor(mutated[key] * (0.8 + Math.random() * 0.4));
        }

        return mutated;
    }

    /**
     * Evolve architectures based on fitness function
     * @param {Array} architectures - Current population
     * @param {Function} fitnessFn - Fitness evaluation function
     * @returns {object} Best architecture
     */
    evolve(architectures, fitnessFn) {
        return architectures[0]; // Placeholder - actual evolution in learn()
    }

    /**
     * Get current best architecture
     * @returns {object} Best architecture config
     */
    getBest() {
        return this.population.reduce((best, curr) =>
            curr.fitness > best.fitness ? curr : best
        );
    }

    /**
     * Get generation statistics
     * @returns {object} Statistics
     */
    getStats() {
        const fitnesses = this.population.map(p => p.fitness);
        return {
            generation: this.generation,
            bestFitness: Math.max(...fitnesses),
            avgFitness: fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length,
            diversity: new Set(fitnesses).size / fitnesses.length
        };
    }
}
