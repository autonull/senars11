/**
 * MeTTaRuleAdapter.js - Adapter for MeTTa rules in SeNARS
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized, Deeply deduplicated
 */

import {Rule} from '@senars/nar';
import {Unify} from '../kernel/Unify.js';

export class MeTTaRuleAdapter extends Rule {
    constructor(ruleTerm, interpreter, config = {}) {
        super(`metta-rule-${Math.random().toString(36).substr(2, 9)}`, 'metta', 1.0, config);
        this.ruleTerm = ruleTerm;
        this.interpreter = interpreter;

        // Parse rule structure: (= (implies $p $q) (do-implication))
        // or (=> $p $q)
        // For now, assume simple implication: (=> condition result)
        this.components = ruleTerm.components;
    }

    /**
     * Apply the rule asynchronously
     */
    async applyAsync(primaryPremise, secondaryPremise, context) {
        if (!this.components || this.components.length < 2) return [];

        const [condition, resultTemplate] = this.components;
        const p1Term = primaryPremise?.term;
        const p2Term = secondaryPremise?.term;

        if (!p1Term) return []; // Primary premise is required

        // Construct input term for unification based on arity
        const inputTerm = secondaryPremise && p2Term
            ? {operator: 'Pair', components: [p1Term, p2Term], name: 'Pair', isCompound: true}
            : p1Term;

        // Match
        const validBindings = Unify.unify(condition, inputTerm, {});
        if (!validBindings) return [];

        // Apply substitution to generate result
        const {Unifier} = await import('../../../core/src/term/Unifier.js');
        const unifier = new Unifier(this.interpreter.termFactory);
        const resultTerm = unifier.applySubstitution(resultTemplate, validBindings);

        if (!resultTerm) return [];

        // Return derived task
        const {Task} = await import('../../../core/src/task/Task.js');
        const {Truth} = await import('../../../core/src/Truth.js'); // Assuming Truth is needed, though usually inherited or calculated based on rule type

        return [new Task({
            term: resultTerm,
            truth: new Truth(0.9, 0.9), // TODO: Calculate truth based on premise confidence
            stamp: primaryPremise.stamp // Should ideally merge stamps
        })];
    }
}
