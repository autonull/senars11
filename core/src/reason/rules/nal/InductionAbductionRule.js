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

        if (!t1?.isCompound || !t2?.isCompound) return false;
        if (t1.operator !== '-->' || t2.operator !== '-->') return false;

        // Shared subject: (M --> P), (M --> S)
        const match = this.unify(t1.subject, t2.subject, context);

        // Also ensure predicates are different (to avoid redundancy/reflexivity)
        return match.success && !t1.predicate?.equals?.(t2.predicate);
    }

    apply(primaryPremise, secondaryPremise, context) {
        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;

        if (!termFactory || !truth1 || !truth2) return [];
        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') return [];

        const match = this.unify(t1.subject, t2.subject, context);
        if (!match.success) return [];
        if (t1.predicate?.equals?.(t2.predicate)) return []; // Avoid T --> T

        // (M --> P), (M --> S) |- (S --> P)
        const derivedTruth = Truth.induction(truth1, truth2);
        if (!derivedTruth) return [];

        const substitution = match.substitution;
        const subject = this.applySubstitution(t2.predicate, substitution, context);
        const predicate = this.applySubstitution(t1.predicate, substitution, context);

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

        if (!t1?.isCompound || !t2?.isCompound) return false;
        if (t1.operator !== '-->' || t2.operator !== '-->') return false;

        // Shared predicate: (P --> M), (S --> M)
        const match = this.unify(t1.predicate, t2.predicate, context);

        return match.success && !t1.subject?.equals?.(t2.subject);
    }

    apply(primaryPremise, secondaryPremise, context) {
        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;

        if (!termFactory || !truth1 || !truth2) return [];
        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') return [];

        const match = this.unify(t1.predicate, t2.predicate, context);

        if (!match.success) return [];
        if (t1.subject?.equals?.(t2.subject)) return []; // Avoid T --> T

        // (P --> M), (S --> M) |- (S --> P)
        const derivedTruth = Truth.abduction(truth1, truth2);
        if (!derivedTruth) return [];

        const substitution = match.substitution;
        const subject = this.applySubstitution(t2.subject, substitution, context);
        const predicate = this.applySubstitution(t1.subject, substitution, context);

        const conclusionTerm = termFactory.create('-->', [subject, predicate]);
        const task = this.createDerivedTask(conclusionTerm, derivedTruth, [primaryPremise, secondaryPremise], context, '.');

        return task ? [task] : [];
    }
}
