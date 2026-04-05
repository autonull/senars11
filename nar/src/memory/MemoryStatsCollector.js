import {TermCategorization} from './TermCategorization.js';

export class MemoryStatsCollector {
    constructor(activationIndex, temporalIndex, compoundIndex) {
        this._activationIndex = activationIndex;
        this._temporalIndex = temporalIndex;
        this._compoundIndex = compoundIndex;
    }

    getStats(totalConcepts, getAllConcepts, indexDetails) {
        const allConcepts = getAllConcepts();
        const stats = {
            totalConcepts,
            inheritanceEntries: 0,
            implicationEntries: 0,
            similarityEntries: 0,
            operatorEntries: 0,
            atomicEntries: 0,
            compoundByOpEntries: 0,
            componentEntries: 0,
            complexityEntries: 0,
            categoryEntries: 0,
            temporalEntries: this._temporalIndex.getAll().length,
            activationEntries: this._activationIndex.getAll().length,
            compoundTermsByOperator: {},
            indexDetails
        };

        const relationshipCounters = {
            '-->': () => stats.inheritanceEntries++,
            '==>': () => stats.implicationEntries++,
            '<->': () => stats.similarityEntries += 2
        };

        for (const concept of allConcepts) {
            if (!concept.term) {continue;}
            if (concept.term.isAtomic) {
                stats.atomicEntries++;
            } else {
                stats.operatorEntries++;
                const op = concept.term.operator;
                if (op) {
                    stats.compoundTermsByOperator[op] = (stats.compoundTermsByOperator[op] || 0) + 1;
                    relationshipCounters[op]?.();
                }
                if (concept.term.components) {
                    for (const component of concept.term.components) {
                        if (component?.operator) {stats.operatorEntries++;}
                    }
                }
            }
        }

        stats.compoundByOpEntries = Object.keys(stats.compoundTermsByOperator).length;
        stats.componentEntries = this._compoundIndex.getAll().filter(c => c.term?.components).length;
        return stats;
    }

    getConceptDistribution(totalConcepts, getAllConcepts) {
        const distribution = {
            byCategory: {},
            byComplexity: {},
            byOperator: {},
            byActivation: {},
            total: totalConcepts
        };

        for (const concept of getAllConcepts()) {
            if (!concept.term) {continue;}
            this._updateDistributionStats(distribution, concept);
        }
        return distribution;
    }

    _updateDistributionStats(distribution, concept) {
        const {term} = concept;
        const category = TermCategorization.getTermCategory(term);
        const complexity = TermCategorization.getTermComplexity(term);
        const activation = concept.activation || 0;

        distribution.byCategory[category] = (distribution.byCategory[category] || 0) + 1;
        distribution.byComplexity[Math.floor(complexity)] = (distribution.byComplexity[Math.floor(complexity)] || 0) + 1;
        if (term.operator) {distribution.byOperator[term.operator] = (distribution.byOperator[term.operator] || 0) + 1;}
        const activationBucket = Math.floor(activation * 10) / 10;
        distribution.byActivation[activationBucket] = (distribution.byActivation[activationBucket] || 0) + 1;
    }
}
