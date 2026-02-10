import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';

/**
 * Analogy Rule (NAL-2)
 * Derives inheritance (-->) using similarity (<->).
 * Substitutes similar terms.
 *
 * Patterns:
 * 1. (S <-> P), (S --> M) |- (P --> M)
 * 2. (S <-> P), (M --> S) |- (M --> P)
 * And symmetric cases for S <-> P.
 */
export class AnalogyRule extends NALRule {
    constructor(config = {}) {
        super('nal-analogy', 'nal', 1.0, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || !secondaryPremise) return false;

        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;

        if (!t1?.isCompound || !t2?.isCompound) return false;

        // One must be similarity, other inheritance
        const isSim1 = t1.operator === '<->';
        const isInh1 = t1.operator === '-->';
        const isSim2 = t2.operator === '<->';
        const isInh2 = t2.operator === '-->';

        if (!((isSim1 && isInh2) || (isSim2 && isInh1))) return false;

        const sim = isSim1 ? t1 : t2;
        const inh = isSim1 ? t2 : t1;

        // Check for shared term
        const s1 = sim.components[0];
        const s2 = sim.components[1];
        const i1 = inh.subject;
        const i2 = inh.predicate;

        return this.unify(s1, i1, context).success ||
               this.unify(s1, i2, context).success ||
               this.unify(s2, i1, context).success ||
               this.unify(s2, i2, context).success;
    }

    apply(primaryPremise, secondaryPremise, context) {
        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;

        if (!termFactory || !truth1 || !truth2) return [];

        const isSim1 = t1.operator === '<->';
        const sim = isSim1 ? t1 : t2;
        const inh = isSim1 ? t2 : t1;

        const s1 = sim.components[0];
        const s2 = sim.components[1];
        const i1 = inh.subject;
        const i2 = inh.predicate;

        const derivedTruth = Truth.analogy(truth1, truth2);
        if (!derivedTruth) return [];

        const results = [];

        // Helper to generate task
        const generate = (replacedSubject, replacedPredicate, sub) => {
            const finalS = this.applySubstitution(replacedSubject, sub, context);
            const finalP = this.applySubstitution(replacedPredicate, sub, context);

            const term = termFactory.inheritance(finalS, finalP);
            const task = this.createDerivedTask(term, derivedTruth, [primaryPremise, secondaryPremise], context, '.');
            if (task) results.push(task);
        };

        // Optimized matching: stop after finding valid matches if necessary,
        // but analogy can produce multiple results. We process all valid unifications.

        const matches = [
            { match: this.unify(s1, i1, context), args: [s2, i2] },
            { match: this.unify(s1, i2, context), args: [i1, s2] },
            { match: this.unify(s2, i1, context), args: [s1, i2] },
            { match: this.unify(s2, i2, context), args: [i1, s1] }
        ];

        for (const {match, args} of matches) {
            if (match.success) {
                generate(args[0], args[1], match.substitution);
            }
        }

        return results;
    }
}
