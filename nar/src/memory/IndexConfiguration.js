export class IndexConfiguration {
    static getDefaultConfig() {
        return {
            complexityLevels: [1, 3, 5, 10, 20],
            activationBuckets: [0.1, 0.3, 0.5, 0.7, 0.9],
            maxTemporalRange: 3600000 // 1 hour in milliseconds
        };
    }

    static getDefaultIndexes() {
        return {
            // Legacy indexes
            inheritance: new Map(), // Map<predicate, Set<subject>>
            implication: new Map(), // Map<premise, Set<conclusion>>
            similarity: new Map(),  // Map<term, Set<related>>
            compound: new Map(),    // Map<operator, Set<terms>>
            term: new Map(),        // Map<termHash, concept>

            // Enhanced indexes for different term types
            atomic: new Map(),      // Map<termName, Set<concepts>> - indexing atomic terms
            compoundByOp: new Map(), // Map<operator, Set<concepts>> - indexing compound terms by operator
            component: new Map(),   // Map<componentTerm, Set<compoundTerms>> - indexing by components
            complexity: new Map(),  // Map<complexityLevel, Set<concepts>> - indexing by complexity
            category: new Map(),    // Map<category, Set<concepts>> - indexing by term category
            temporal: new Map(),    // Map<timeRange, Set<concepts>> - temporal indexing
            activation: new Map()   // Map<activationRange, Set<concepts>> - activation-based indexing
        };
    }
}