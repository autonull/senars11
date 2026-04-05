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
        if (!context?.termFactory || !t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') {
            return [];
        }

        const [shared1, shared2] = isInduction ? [t1.subject, t2.subject] : [t1.predicate, t2.predicate];
        const [other1, other2] = isInduction ? [t1.predicate, t2.predicate] : [t1.subject, t2.subject];

        const match = this.unify(shared1, shared2, context);
        if (!match.success || other1?.equals?.(other2)) {
            return [];
        }

        const newTruth = isInduction ? Truth.induction(tr1, tr2) : Truth.abduction(tr1, tr2);
        if (!newTruth) {
            return [];
        }

        const subject = this.applySubstitution(other2, match.substitution, context);
        const predicate = this.applySubstitution(other1, match.substitution, context);

        const task = this.createDerivedTask(
            context.termFactory.create('-->', [subject, predicate]),
            newTruth, [p1, p2], context
        );
        return task ? [task] : [];
    }
}

export class InductionRule extends SharedTermRule {
    constructor(config = {}) {
        super('nal-induction', 'nal', 0.9, config);
    }

    canApply(p1, p2, context) {
        const t1 = p1?.term, t2 = p2?.term;
        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') {
            return false;
        }
        return this.unify(t1.subject, t2.subject, context).success && !t1.predicate?.equals?.(t2.predicate);
    }

    apply(p1, p2, context) {
        return this._tryApply(p1, p2, context, true);
    }
}

export class AbductionRule extends SharedTermRule {
    constructor(config = {}) {
        super('nal-abduction', 'nal', 0.9, config);
    }

    canApply(p1, p2, context) {
        const t1 = p1?.term, t2 = p2?.term;
        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') {
            return false;
        }
        return this.unify(t1.predicate, t2.predicate, context).success && !t1.subject?.equals?.(t2.subject);
    }

    apply(p1, p2, context) {
        return this._tryApply(p1, p2, context, false);
    }
}
