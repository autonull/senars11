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
 * Shared logic for induction and abduction
 */
class SharedTermRule extends NALRule {
    _tryApply(p1, p2, context, isInduction) {
        const {term: t1, truth: tr1} = p1;
        const {term: t2, truth: tr2} = p2;
        const termFactory = context?.termFactory;

        if (!termFactory || !tr1 || !tr2 || !t1?.isCompound || !t2?.isCompound) return [];
        if (t1.operator !== '-->' || t2.operator !== '-->') return [];

        // Induction: Shared subject; Abduction: Shared predicate
        const shared1 = isInduction ? t1.subject : t1.predicate;
        const shared2 = isInduction ? t2.subject : t2.predicate;

        const match = this.unify(shared1, shared2, context);

        const other1 = isInduction ? t1.predicate : t1.subject;
        const other2 = isInduction ? t2.predicate : t2.subject;

        if (!match.success || other1?.equals?.(other2)) return [];

        const derivedTruth = isInduction ? Truth.induction(tr1, tr2) : Truth.abduction(tr1, tr2);
        if (!derivedTruth) return [];

        const substitution = match.substitution;
        const subject = this.applySubstitution(other2, substitution, context);
        const predicate = this.applySubstitution(other1, substitution, context);

        const conclusionTerm = termFactory.create('-->', [subject, predicate]);
        const task = this.createDerivedTask(conclusionTerm, derivedTruth, [p1, p2], context, '.');

        return task ? [task] : [];
    }
}

/**
 * Induction Rule: Shared subject pattern
 * (M --> P), (M --> S) |- (S --> P)
 */
export class InductionRule extends SharedTermRule {
    constructor(config = {}) {
        super('nal-induction', 'nal', 0.9, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || !secondaryPremise) return false;
        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;
        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') return false;

        const match = this.unify(t1.subject, t2.subject, context);
        return match.success && !t1.predicate?.equals?.(t2.predicate);
    }

    apply(primaryPremise, secondaryPremise, context) {
        return this._tryApply(primaryPremise, secondaryPremise, context, true);
    }
}

/**
 * Abduction Rule: Shared predicate pattern
 * (P --> M), (S --> M) |- (S --> P)
 */
export class AbductionRule extends SharedTermRule {
    constructor(config = {}) {
        super('nal-abduction', 'nal', 0.9, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || !secondaryPremise) return false;
        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;
        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') return false;

        const match = this.unify(t1.predicate, t2.predicate, context);
        return match.success && !t1.subject?.equals?.(t2.subject);
    }

    apply(primaryPremise, secondaryPremise, context) {
        return this._tryApply(primaryPremise, secondaryPremise, context, false);
    }
}
