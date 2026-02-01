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
        const unifier = context?.unifier;

        if (!t1?.isCompound || !t2?.isCompound) return false;

        // One must be similarity, other inheritance
        const isSim1 = t1.operator === '<->';
        const isInh1 = t1.operator === '-->';
        const isSim2 = t2.operator === '<->';
        const isInh2 = t2.operator === '-->';

        if (!((isSim1 && isInh2) || (isSim2 && isInh1))) return false;

        // Identify which is similarity and which is inheritance
        const sim = isSim1 ? t1 : t2;
        const inh = isSim1 ? t2 : t1;

        // Check for shared term
        // Similarity has components [0, 1]. Inheritance has [0, 1].
        // Check if any component of Sim matches any component of Inh
        const checkMatch = (u, v) => {
             if (unifier) {
                return unifier.unify(u, v).success;
            }
            return u?.equals?.(v);
        };

        const s1 = sim.components[0];
        const s2 = sim.components[1];
        const i1 = inh.subject;
        const i2 = inh.predicate;

        return checkMatch(s1, i1) || checkMatch(s1, i2) || checkMatch(s2, i1) || checkMatch(s2, i2);
    }

    apply(primaryPremise, secondaryPremise, context) {
        if (!this.canApply(primaryPremise, secondaryPremise, context)) return [];

        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;
        const unifier = context?.unifier;

        if (!termFactory || !truth1 || !truth2) return [];

        const isSim1 = t1.operator === '<->';
        const sim = isSim1 ? t1 : t2;
        const inh = isSim1 ? t2 : t1;

        let substitution = {};
        const match = (u, v) => {
            if (unifier) {
                const res = unifier.unify(u, v);
                if (res.success) {
                    substitution = res.substitution;
                    return true;
                }
                return false;
            }
            return u?.equals?.(v);
        };

        const s1 = sim.components[0];
        const s2 = sim.components[1];
        const i1 = inh.subject;
        const i2 = inh.predicate;

        const derivedTruth = Truth.analogy(truth1, truth2);
        if (!derivedTruth) return [];

        const results = [];

        // Helper to generate task
        const generate = (replacedSubject, replacedPredicate, sub) => {
            let finalS = replacedSubject;
            let finalP = replacedPredicate;

            if (unifier && Object.keys(sub).length > 0) {
                finalS = unifier.applySubstitution(finalS, sub);
                finalP = unifier.applySubstitution(finalP, sub);
            }

            const term = termFactory.inheritance(finalS, finalP);
            const task = this.createDerivedTask(term, derivedTruth, [primaryPremise, secondaryPremise], context, '.');
            if (task) results.push(task);
        };

        // Try all combinations
        // Case 1: s1 matches i1. Replace i1 with s2.
        if (match(s1, i1)) {
            generate(s2, i2, substitution);
        }
        // Case 2: s1 matches i2. Replace i2 with s2.
        if (match(s1, i2)) {
            generate(i1, s2, substitution);
        }
        // Case 3: s2 matches i1. Replace i1 with s1.
        if (match(s2, i1)) {
            generate(s1, i2, substitution);
        }
        // Case 4: s2 matches i2. Replace i2 with s1.
        if (match(s2, i2)) {
            generate(i1, s1, substitution);
        }

        return results;
    }
}
