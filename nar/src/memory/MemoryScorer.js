import {clamp} from '@senars/core/src/util/common.js';

/**
 * Handles scoring and ranking logic for Memory concepts.
 */
export class MemoryScorer {
    static SCORING_WEIGHTS = Object.freeze({activation: 0.5, useCount: 0.3, taskCount: 0.2});
    static NORMALIZATION_LIMITS = Object.freeze({useCount: 100, taskCount: 50});

    static calculateConceptComplexityScore(concept, termFactory = null) {
        if (termFactory && concept.term) {
            return Math.min(1, termFactory.getComplexity(concept.term) / 10);
        }

        if (concept.term && concept.term.components) {
            const baseComplexity = Math.min(1, concept.term.components.length * 0.3);
            let nestedComplexity = 0;
            if (Array.isArray(concept.term.components)) {
                for (const comp of concept.term.components) {
                    if (comp.components && comp.components.length > 0) {
                        nestedComplexity += 0.2;
                    }
                }
            }

            return Math.min(1, baseComplexity + nestedComplexity);
        }
        return 0.1;
    }

    static calculateConceptDiversityScore(concept, cognitiveDiversity) {
        if (cognitiveDiversity) {
            const systemDiversity = cognitiveDiversity.getMetrics();
            return systemDiversity.diversityScore || 0;
        }
        return 0;
    }

    static calculateRecencyScore(lastAccessed) {
        const now = Date.now();
        const timeDiff = now - lastAccessed;
        // Recency score decreases with time (more recent = higher score)
        return Math.exp(-timeDiff / (24 * 60 * 60 * 1000)); // Decay over 24 hours
    }

    static calculateDetailedConceptScore(concept, options = {}) {
        const {
            activationWeight = 0.5, useCountWeight = 0.3, taskCountWeight = 0.2, // standard defaults
            qualityWeight = 0, complexityWeight = 0, diversityWeight = 0,
            termFactory = null,
            cognitiveDiversity = null
        } = options;

        const activationScore = concept.activation;
        const normalizedUseCount = clamp(concept.useCount / MemoryScorer.NORMALIZATION_LIMITS.useCount, 0, 1);
        const normalizedTaskCount = clamp(concept.totalTasks / MemoryScorer.NORMALIZATION_LIMITS.taskCount, 0, 1);

        // Extended metrics (only used if weights > 0)
        const qualityScore = qualityWeight > 0 ? (concept.quality || 0) : 0;
        const complexityScore = complexityWeight > 0 ? (termFactory
            ? Math.min(1, termFactory.getComplexity(concept.term) / 10)
            : MemoryScorer.calculateConceptComplexityScore(concept)) : 0;
        const diversityScore = diversityWeight > 0 ? (cognitiveDiversity ? MemoryScorer.calculateConceptDiversityScore(concept, cognitiveDiversity) : 0) : 0;

        // Recency score logic from original composite scorer (only if complexity weight is present, implying composite mode)
        const recencyScore = complexityWeight > 0 ? MemoryScorer.calculateRecencyScore(concept.lastAccessed) * 0.05 : 0;

        const compositeScore = (activationScore * activationWeight) +
            (normalizedUseCount * useCountWeight) +
            (normalizedTaskCount * taskCountWeight) +
            (qualityScore * qualityWeight) +
            (complexityScore * complexityWeight) +
            (diversityScore * diversityWeight) +
            recencyScore;

        return {
            compositeScore,
            activationScore,
            useCountScore: normalizedUseCount,
            taskCountScore: normalizedTaskCount,
            qualityScore,
            complexityScore,
            diversityScore
        };
    }

    static getSorterFunction(sortBy) {
        const sorters = {
            'activation': (a, b) => b.concept.activation - a.concept.activation,
            'complexity': (a, b) => b.score.complexityScore - a.score.complexityScore,
            'diversity': (a, b) => b.score.diversityScore - a.score.diversityScore,
            'composite': (a, b) => b.score.compositeScore - a.score.compositeScore
        };

        return sorters[sortBy] || sorters['composite'];
    }
}
