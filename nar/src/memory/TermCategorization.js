export class TermCategorization {
    /**
     * Get the complexity of a term (simplified)
     */
    static getTermComplexity(term) {
        // Base complexity on number of components and nesting
        if (!term || !term.components) return 1;

        let complexity = 1; // Base complexity

        if (Array.isArray(term.components)) {
            complexity += term.components.length * 0.5; // Add complexity for each component

            // Add complexity for nested structures
            for (const comp of term.components) {
                if (comp.components && comp.components.length > 0) {
                    complexity += TermCategorization.getTermComplexity(comp);
                }
            }
        }

        return complexity;
    }

    /**
     * Get the complexity level bucket for a given complexity value
     */
    static getComplexityLevel(complexity, config) {
        const level = config.complexityLevels.find(threshold => complexity <= threshold);
        return level !== undefined
            ? `level_${level}`
            : `level_${config.complexityLevels[config.complexityLevels.length - 1]}_plus`;
    }

    /**
     * Get the category of a term based on its structure
     */
    static getTermCategory(term) {
        if (!term) return 'unknown';

        if (term.isAtomic) return 'atomic';

        // Categorize based on operator using object lookup for better performance
        const categoryMap = {
            '-->': 'inheritance',
            '==>': 'implication',
            '<->': 'similarity',
            '&': 'conjunction',
            '|': 'disjunction',
            '^': 'operation',
            '--': 'negation'
        };

        return categoryMap[term.operator] ?? 'compound';
    }

    /**
     * Get the activation bucket for a given activation value
     */
    static getActivationBucket(activation, config) {
        if (activation === undefined) activation = 0;

        const bucket = config.activationBuckets.find(threshold => activation <= threshold);
        return bucket !== undefined
            ? `act_${bucket}`
            : `act_${config.activationBuckets[config.activationBuckets.length - 1]}_plus`;
    }

    /**
     * Get the temporal bucket for a given timestamp
     */
    static getTemporalBucket(timestamp, config) {
        // Group by hour (for now)
        const hourBucket = Math.floor(timestamp / config.maxTemporalRange);
        return `hour_${hourBucket}`;
    }
}