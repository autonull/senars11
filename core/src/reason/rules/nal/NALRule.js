import {Rule} from '../../Rule.js';
import {Stamp} from '../../../Stamp.js';
import {Task} from '../../../task/Task.js';

/**
 * Base class for NAL rules in the stream reasoner system.
 * Provides common functionality for NAL rule implementations.
 */
export class NALRule extends Rule {
    constructor(id, ruleType = 'nal', priority = 1.0, config = {}) {
        super(id, ruleType, priority, config);
    }

    /**
     * Unify two terms or check equality if unifier is not available.
     * @protected
     */
    unify(t1, t2, context) {
        return context?.unifier?.unify(t1, t2) ?? {
            success: t1?.equals?.(t2) ?? false,
            substitution: {}
        };
    }

    /**
     * Apply substitution to a term if unifier is available.
     * @protected
     */
    applySubstitution(term, substitution, context) {
        if (!context?.unifier || !substitution || Object.keys(substitution).length === 0) {
            return term;
        }
        return context.unifier.applySubstitution(term, substitution);
    }

    /**
     * Create a derived task with proper NAL semantics
     * @protected
     */
    createDerivedTask(term, truth, premises, context, punctuation = '.') {
        if (!term || !truth) return null;

        // Create new stamp combining premise stamps
        const stamp = this._deriveStamp(premises);

        // Calculate budget based on premises
        const budget = this._calculateConclusionBudget(premises);

        return new Task({
            term,
            punctuation,
            truth,
            stamp,
            budget
        });
    }

    /**
     * Create a stamp that tracks NAL derivation history
     * @protected
     */
    _deriveStamp(premises) {
        const premiseStamps = premises.map(p => p.stamp).filter(s => s);
        return Stamp.derive(premiseStamps);
    }

    /**
     * Calculate budget for the derived task
     * @protected
     */
    _calculateConclusionBudget(premises) {
        // Default to 0.5 if missing
        const p1Priority = premises[0]?.budget?.priority ?? 0.5;
        const p2Priority = premises[1]?.budget?.priority ?? 0.5;

        // Calculate priority: p1 * p2 * rulePriority
        // Handle single premise case correctly (though usually NAL rules are binary)
        const priority = premises.length === 1
            ? p1Priority * this.priority
            : p1Priority * p2Priority * this.priority;

        // Calculate durability and quality (min of premises)
        const durabilities = premises.map(p => p.budget?.durability ?? 0.5);
        const qualities = premises.map(p => p.budget?.quality ?? 0.5);

        const durability = Math.min(...durabilities);
        const quality = Math.min(...qualities);

        return {
            priority,
            durability,
            quality
        };
    }
}
