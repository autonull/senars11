import {Rule, Truth, Task, Unifier} from '@senars/nar';
import {Unify} from '../kernel/Unify.js';

export class MeTTaRuleAdapter extends Rule {
    constructor(ruleTerm, interpreter, config = {}) {
        super(`metta-rule-${Math.random().toString(36).slice(2, 11)}`, 'metta', 1.0, config);
        this.ruleTerm = ruleTerm;
        this.interpreter = interpreter;
        this.components = ruleTerm.components;
    }

    async applyAsync(primaryPremise, secondaryPremise, context) {
        if (!this.components || this.components.length < 2) return [];

        const [condition, resultTemplate] = this.components;
        const p1Term = primaryPremise?.term;
        const p2Term = secondaryPremise?.term;

        if (!p1Term) return [];

        const inputTerm = secondaryPremise && p2Term
            ? {operator: 'Pair', components: [p1Term, p2Term], name: 'Pair', isCompound: true}
            : p1Term;

        const validBindings = Unify.unify(condition, inputTerm, {});
        if (!validBindings) return [];

        const unifier = new Unifier(this.interpreter.termFactory);
        const resultTerm = unifier.applySubstitution(resultTemplate, validBindings);

        if (!resultTerm) return [];

        const truth = this._deriveTruth(primaryPremise, secondaryPremise);

        return [new Task({
            term: resultTerm,
            truth,
            stamp: primaryPremise.stamp
        })];
    }

    _deriveTruth(primaryPremise, secondaryPremise) {
        const p1Truth = primaryPremise?.truth;
        const p2Truth = secondaryPremise?.truth;

        if (p1Truth && p2Truth) {
            return Truth.deduction(p1Truth, p2Truth);
        }
        if (p1Truth) {
            return new Truth(p1Truth.f * 0.9, p1Truth.c * 0.9);
        }
        return new Truth(0.9, 0.9);
    }
}
