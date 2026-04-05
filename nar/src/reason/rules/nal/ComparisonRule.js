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
        const t1 = primaryPremise?.term;
        const t2 = secondaryPremise?.term;

        if (!t1?.isCompound || !t2?.isCompound || t1.operator !== '-->' || t2.operator !== '-->') {
            return false;
        }

        return this.unify(t1.subject, t2.subject, context).success ||
            this.unify(t1.predicate, t2.predicate, context).success;
    }

    apply(primaryPremise, secondaryPremise, context) {
        const t1 = primaryPremise.term;
        const t2 = secondaryPremise.term;
        if (!context?.termFactory) {
            return [];
        }

        const matchS = this.unify(t1.subject, t2.subject, context);
        const matchP = this.unify(t1.predicate, t2.predicate, context);

        const config = matchS.success
            ? {sub: matchS.substitution, a: t2.predicate, b: t1.predicate}
            : (matchP.success ? {sub: matchP.substitution, a: t2.subject, b: t1.subject} : null);

        if (!config || this.unify(config.a, config.b, context).success) {
            return [];
        }

        const newTruth = Truth.comparison(primaryPremise.truth, secondaryPremise.truth);
        if (!newTruth) {
            return [];
        }

        const termA = this.applySubstitution(config.a, config.sub, context);
        const termB = this.applySubstitution(config.b, config.sub, context);
        const term = context.termFactory.similarity(termA, termB);

        const task = this.createDerivedTask(term, newTruth, [primaryPremise, secondaryPremise], context);
        return task ? [task] : [];
    }
}
