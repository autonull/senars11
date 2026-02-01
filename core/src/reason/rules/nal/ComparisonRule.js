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
        const unifier = context?.unifier;

        if (!t1?.isCompound || !t2?.isCompound) return false;
        // Must be inheritance
        if (t1.operator !== '-->' || t2.operator !== '-->') return false;

        // Check for shared subject
        const checkSharedSubject = () => {
             if (unifier) {
                return unifier.unify(t1.subject, t2.subject).success;
            }
            return t1.subject?.equals?.(t2.subject);
        };

        // Check for shared predicate
        const checkSharedPredicate = () => {
             if (unifier) {
                return unifier.unify(t1.predicate, t2.predicate).success;
            }
            return t1.predicate?.equals?.(t2.predicate);
        };

        return checkSharedSubject() || checkSharedPredicate();
    }

    apply(primaryPremise, secondaryPremise, context) {
        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;
        const unifier = context?.unifier;

        if (!termFactory || !truth1 || !truth2) return [];
        if (!this.canApply(primaryPremise, secondaryPremise, context)) return [];

        let substitution = {};

        // Helper to match
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

        let termA, termB;

        // Pattern 1: Shared Subject (M --> P), (M --> S) -> (S <-> P)
        if (match(t1.subject, t2.subject)) {
            // M matches.
            // t1: M --> P. t2: M --> S.
            // Result: S <-> P.
            termA = t2.predicate;
            termB = t1.predicate;
        }
        // Pattern 2: Shared Predicate (P --> M), (S --> M) -> (S <-> P)
        else if (match(t1.predicate, t2.predicate)) {
            // M matches.
            // t1: P --> M. t2: S --> M.
            // Result: S <-> P.
            termA = t2.subject;
            termB = t1.subject;
        } else {
            return [];
        }

        // Avoid self-similarity? NAL usually allows it but it's tautology.
        if (match(termA, termB)) return [];

        const derivedTruth = Truth.comparison(truth1, truth2);
        if (!derivedTruth) return [];

        if (unifier && Object.keys(substitution).length > 0) {
            termA = unifier.applySubstitution(termA, substitution);
            termB = unifier.applySubstitution(termB, substitution);
        }

        const conclusionTerm = termFactory.similarity(termA, termB);
        const task = this.createDerivedTask(conclusionTerm, derivedTruth, [primaryPremise, secondaryPremise], context, '.');

        return task ? [task] : [];
    }
}
