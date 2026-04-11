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
        const t1 = primaryPremise?.term;
        const t2 = secondaryPremise?.term;
        if (!t1?.isCompound || !t2?.isCompound) {
            return false;
        }

        const isSim = t => t.operator === '<->';
        const isInh = t => t.operator === '-->';

        if (!((isSim(t1) && isInh(t2)) || (isSim(t2) && isInh(t1)))) {
            return false;
        }

        const sim = isSim(t1) ? t1 : t2;
        const inh = isSim(t1) ? t2 : t1;

        return sim.components.some(s =>
            inh.components.some(i => this.unify(s, i, context).success)
        );
    }

    apply(primaryPremise, secondaryPremise, context) {
        const t1 = primaryPremise.term;
        const t2 = secondaryPremise.term;
        if (!context?.termFactory) {
            return [];
        }

        const isSim = t1.operator === '<->';
        const sim = isSim ? t1 : t2;
        const inh = isSim ? t2 : t1;

        const s1 = sim.components[0], s2 = sim.components[1];
        const i1 = inh.subject, i2 = inh.predicate;

        const newTruth = Truth.analogy(primaryPremise.truth, secondaryPremise.truth);
        if (!newTruth) {
            return [];
        }

        const results = [];
        const matches = [
            {match: this.unify(s1, i1, context), s: s2, p: i2},
            {match: this.unify(s1, i2, context), s: i1, p: s2},
            {match: this.unify(s2, i1, context), s: s1, p: i2},
            {match: this.unify(s2, i2, context), s: i1, p: s1}
        ];

        for (const {match, s, p} of matches) {
            if (match.success) {
                const termS = this.applySubstitution(s, match.substitution, context);
                const termP = this.applySubstitution(p, match.substitution, context);
                const task = this.createDerivedTask(
                    context.termFactory.inheritance(termS, termP),
                    newTruth, [primaryPremise, secondaryPremise], context
                );
                if (task) {
                    results.push(task);
                }
            }
        }
        return results;
    }
}
