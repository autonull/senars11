import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';

export class Decompose1 extends NALRule {
    constructor(config = {}) {
        super('nal-decompose1', 'nal', 1.0, config);
    }

    /**
     * Decompose1 rule applies to compound terms like Conjunctions.
     * (A && B). |- A. B.
     */
    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || secondaryPremise) return false; // Only unary
        const term = primaryPremise.term;
        // Check for conjunction-like compounds: &&, &, *
        return term && term.isCompound && ['&&', '&', '*'].includes(term.operator);
    }

    apply(primaryPremise, secondaryPremise, context) {
        if (!this.canApply(primaryPremise, secondaryPremise, context)) return [];

        const term = primaryPremise.term;
        const truth = primaryPremise.truth;
        const derived = [];

        // Apply structural deduction to get truth of components
        const derivedTruth = Truth.structuralDeduction(truth);

        if (derivedTruth) {
            term.components.forEach(comp => {
                // Avoid creating tasks for trivial components if necessary, but here we just derive
                const task = this.createDerivedTask(
                    comp,
                    derivedTruth,
                    [primaryPremise],
                    context
                );
                if (task) derived.push(task);
            });
        }

        return derived;
    }
}
