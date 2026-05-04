import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';
import {logError} from '@senars/core';

/**
 * Implements the Modus Ponens inference rule for the stream reasoner.
 *
 * Premise 1: (P ==> Q) {f1, c1}
 * Premise 2: P {f2, c2}
 * Conclusion: Q {F_ded}
 */
export class ModusPonensRule extends NALRule {
    constructor(config = {}) {
        super('nal-modusponens', 'nal', 1.0, config);
    }

    /**
     * Check if this rule can be applied to the given premise pair
     * @param {Task} primaryPremise - The first premise
     * @param {Task} secondaryPremise - The second premise
     * @param {Object} context - Context object that may contain termFactory
     * @returns {boolean} Whether the rule can be applied
     */
    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || !secondaryPremise) {
            return false;
        }
        return this._getMatch(primaryPremise, secondaryPremise, context) !== null;
    }

    apply(primaryPremise, secondaryPremise, context = {}) {
        try {
            const match = this._getMatch(primaryPremise, secondaryPremise, context);
            if (!match) {
                return [];
            }

            const {implicationPremise, antecedentPremise, substitution} = match;
            const Q = implicationPremise.term.components[1];
            const t1 = implicationPremise.truth;
            const t2 = antecedentPremise.truth;

            const newTruth = new Truth(t1.f * t2.f, t1.c * t2.c * t1.f);
            const finalConsequent = this.applySubstitution(Q, substitution, context);

            const derivedTask = super.createDerivedTask(finalConsequent, newTruth, [primaryPremise, secondaryPremise]);
            return derivedTask ? [derivedTask] : [];
        } catch (error) {
            logError(error, {ruleId: this.id, context: 'modus_ponens_rule_application'}, 'error');
            return [];
        }
    }

    _getMatch(p1, p2, context) {
        const check = (imp, ant) => {
            if (imp.term.operator !== '==>') {
                return null;
            }
            const match = this.unify(imp.term.components[0], ant.term, context);
            return match.success ? {
                implicationPremise: imp,
                antecedentPremise: ant,
                substitution: match.substitution
            } : null;
        };
        return check(p1, p2) || check(p2, p1);
    }
}
