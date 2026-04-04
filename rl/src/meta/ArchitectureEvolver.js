import { mergeConfig } from '../utils/ConfigHelper.js';

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
            this.population.push(variationFn(baseArchitecture, i));
        }
        return this.population;
    }

    async evolve(fitnessFn, options = {}) {
        const { generations = 10, elitismRate = 0.2, mutationRate = 0.3, crossoverRate = 0.5 } = options;
        const evolutionHistory = [];

        for (let gen = 0; gen < generations; gen++) {
            this.generation = gen;
            const fitnessScores = await Promise.all(this.population.map(fitnessFn));
            const elites = this._selectElites(fitnessScores, elitismRate);
            const offspring = [];

            while (offspring.length < this.population.length * crossoverRate) {
                const [p1, p2] = this._tournamentSelect(fitnessScores, 3);
                offspring.push(this._crossover(p1, p2));
            }

            const mutated = offspring.map(ind => this._mutate(ind, mutationRate));
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
        return Math.random() > 0.5 ? p1 : p2;
    }

    _mutate(individual, mutationRate) {
        return Math.random() < mutationRate ? individual : individual;
    }

    _getBestIndex(fitnessScores) {
        return fitnessScores.indexOf(Math.max(...fitnessScores));
    }
}

export { ArchitectureEvolver as Evolver };
