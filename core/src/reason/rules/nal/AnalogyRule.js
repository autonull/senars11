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

        // Try all combinations
        const m1 = this.unify(s1, i1, context);
        if (m1.success) generate(s2, i2, m1.substitution);

        const m2 = this.unify(s1, i2, context);
        if (m2.success) generate(i1, s2, m2.substitution);

        const m3 = this.unify(s2, i1, context);
        if (m3.success) generate(s1, i2, m3.substitution);

        const m4 = this.unify(s2, i2, context);
        if (m4.success) generate(i1, s1, m4.substitution);

        return results;
    }
}
