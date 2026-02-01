/**
 * @file InductionAbductionRule.js
 * @description Induction and Abduction inference rules.
 *
 * Induction: (M --> P), (M --> S) |- (S --> P)  [shared subject]
 * Abduction: (P --> M), (S --> M) |- (S --> P)  [shared predicate]
 */

import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';

/**
 * Induction Rule: Shared subject pattern
 * (M --> P), (M --> S) |- (S --> P)
 */
export class InductionRule extends NALRule {
    constructor(config = {}) {
        super('nal-induction', 'nal', 0.9, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || !secondaryPremise) return false;

        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;
        const unifier = context?.unifier;

        if (!t1?.isCompound || !t2?.isCompound) return false;
        if (t1.operator !== '-->' || t2.operator !== '-->') return false;

        // Shared subject: (M --> P), (M --> S)
        const checkSharedSubject = () => {
            if (unifier) {
                return unifier.unify(t1.subject, t2.subject).success;
            }
            return t1.subject?.equals?.(t2.subject);
        };

        // Also ensure predicates are different (to avoid redundancy/reflexivity)
        // Although strict inequality might prevent some valid edge cases, it's standard NAL
        return checkSharedSubject() && !t1.predicate?.equals?.(t2.predicate);
    }

    apply(primaryPremise, secondaryPremise, context) {
        // Only checking structure here as we need to capture substitution
        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;
        const unifier = context?.unifier;

        if (!termFactory || !truth1 || !truth2) return [];
        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') return [];

        let substitution = {};
        let success = false;

        if (unifier) {
            const res = unifier.unify(t1.subject, t2.subject);
            if (res.success) {
                substitution = res.substitution;
                success = true;
            }
        } else {
            success = t1.subject?.equals?.(t2.subject);
        }

        if (!success) return [];
        if (t1.predicate?.equals?.(t2.predicate)) return []; // Avoid T --> T

        // (M --> P), (M --> S) |- (S --> P)
        const derivedTruth = Truth.induction(truth1, truth2);
        if (!derivedTruth) return [];

        let subject = t2.predicate;
        let predicate = t1.predicate;

        if (unifier && Object.keys(substitution).length > 0) {
            subject = unifier.applySubstitution(subject, substitution);
            predicate = unifier.applySubstitution(predicate, substitution);
        }

        const conclusionTerm = termFactory.create('-->', [subject, predicate]);
        const task = this.createDerivedTask(conclusionTerm, derivedTruth, [primaryPremise, secondaryPremise], context, '.');

        return task ? [task] : [];
    }
}

/**
 * Abduction Rule: Shared predicate pattern
 * (P --> M), (S --> M) |- (S --> P)
 */
export class AbductionRule extends NALRule {
    constructor(config = {}) {
        super('nal-abduction', 'nal', 0.9, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || !secondaryPremise) return false;

        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;
        const unifier = context?.unifier;

        if (!t1?.isCompound || !t2?.isCompound) return false;
        if (t1.operator !== '-->' || t2.operator !== '-->') return false;

        // Shared predicate: (P --> M), (S --> M)
        const checkSharedPredicate = () => {
             if (unifier) {
                return unifier.unify(t1.predicate, t2.predicate).success;
            }
            return t1.predicate?.equals?.(t2.predicate);
        };

        return checkSharedPredicate() && !t1.subject?.equals?.(t2.subject);
    }

    apply(primaryPremise, secondaryPremise, context) {
        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;
        const unifier = context?.unifier;

        if (!termFactory || !truth1 || !truth2) return [];
        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') return [];

        let substitution = {};
        let success = false;

        if (unifier) {
            const res = unifier.unify(t1.predicate, t2.predicate);
            if (res.success) {
                substitution = res.substitution;
                success = true;
            }
        } else {
            success = t1.predicate?.equals?.(t2.predicate);
        }

        if (!success) return [];
        if (t1.subject?.equals?.(t2.subject)) return []; // Avoid T --> T

        // (P --> M), (S --> M) |- (S --> P)
        const derivedTruth = Truth.abduction(truth1, truth2);
        if (!derivedTruth) return [];

        let subject = t2.subject;
        let predicate = t1.subject;

        if (unifier && Object.keys(substitution).length > 0) {
            subject = unifier.applySubstitution(subject, substitution);
            predicate = unifier.applySubstitution(predicate, substitution);
        }

        const conclusionTerm = termFactory.create('-->', [subject, predicate]);
        const task = this.createDerivedTask(conclusionTerm, derivedTruth, [primaryPremise, secondaryPremise], context, '.');

        return task ? [task] : [];
    }
}
