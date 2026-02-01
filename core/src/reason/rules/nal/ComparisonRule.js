import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';

/**
 * Comparison Rule (NAL-2)
 * Derives similarity (<->) from shared properties.
 *
 * Patterns:
 * 1. Shared Subject: (M --> P), (M --> S) |- (S <-> P)
 * 2. Shared Predicate: (P --> M), (S --> M) |- (S <-> P)
 */
export class ComparisonRule extends NALRule {
    constructor(config = {}) {
        super('nal-comparison', 'nal', 0.9, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || !secondaryPremise) return false;

        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;

        if (!t1?.isCompound || !t2?.isCompound) return false;
        // Must be inheritance
        if (t1.operator !== '-->' || t2.operator !== '-->') return false;

        // Check for shared subject
        const matchS = this.unify(t1.subject, t2.subject, context);
        // Check for shared predicate
        const matchP = !matchS.success && this.unify(t1.predicate, t2.predicate, context);

        return matchS.success || matchP.success;
    }

    apply(primaryPremise, secondaryPremise, context) {
        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;

        if (!termFactory || !truth1 || !truth2) return [];

        let termA, termB;
        let substitution = {};

        // Pattern 1: Shared Subject (M --> P), (M --> S) -> (S <-> P)
        const matchS = this.unify(t1.subject, t2.subject, context);
        if (matchS.success) {
            substitution = matchS.substitution;
            termA = t2.predicate;
            termB = t1.predicate;
        } else {
            // Pattern 2: Shared Predicate (P --> M), (S --> M) -> (S <-> P)
            const matchP = this.unify(t1.predicate, t2.predicate, context);
            if (matchP.success) {
                substitution = matchP.substitution;
                termA = t2.subject;
                termB = t1.subject;
            } else {
                return [];
            }
        }

        // Avoid self-similarity
        if (this.unify(termA, termB, context).success) return [];

        const derivedTruth = Truth.comparison(truth1, truth2);
        if (!derivedTruth) return [];

        termA = this.applySubstitution(termA, substitution, context);
        termB = this.applySubstitution(termB, substitution, context);

        const conclusionTerm = termFactory.similarity(termA, termB);
        const task = this.createDerivedTask(conclusionTerm, derivedTruth, [primaryPremise, secondaryPremise], context, '.');

        return task ? [task] : [];
    }
}
