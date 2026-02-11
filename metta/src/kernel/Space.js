/**
 * Space.js - Set of atoms with functor indexing
 * Core storage and retrieval mechanism for MeTTa programs
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized, Deeply deduplicated
 */

import { isExpression, exp, sym } from './Term.js';
import { RuleIndex } from './RuleIndex.js';

export class Space {
    constructor() {
        this.atoms = new Set();
        this.ruleIndex = new RuleIndex();
        this._stats = { adds: 0, removes: 0, queries: 0 };
    }

    /**
     * Add an atom to the space
     */
    add(atom) {
        if (!atom) throw new Error("Cannot add null/undefined atom");
        if (!this.atoms.has(atom)) {
            this.atoms.add(atom);
            // For simple atoms, we index them as "rules" where the atom itself is the pattern
            // This allows them to be found by unification queries.
            // However, RuleIndex expects { pattern: ... } or just the term if it's the pattern itself.
            // RuleIndex checks `rule.pattern`. If undefined, it assumes the rule IS the pattern? No.
            // Let's modify RuleIndex to handle raw terms or wrap it.
            // Or better, wrap here.

            // Wait, existing logic in RuleIndex: `const pattern = rule.pattern;`.
            // If we pass an atom directly, `atom.pattern` is undefined.
            // We should wrap it: { pattern: atom, result: undefined } (unit clause)
            // BUT, `addRule` adds `{pattern, result}`.
            // Original `_indexItem` indexed the item itself using `item` as pattern if it was an expression.
            // So we should wrap it to be consistent with RuleIndex expectation.
            this.ruleIndex.addRule({ pattern: atom });
            this._stats.adds++;
        }
        return this;
    }

    /**
     * Remove an atom from the space
     */
    remove(atom) {
        if (this.atoms.has(atom)) {
            this.atoms.delete(atom);
            this.ruleIndex.removeRule(atom);
            this._stats.removes++;
            return true;
        }
        return false;
    }

    /**
     * Check if an atom exists in the space
     */
    has(atom) {
        return this.atoms.has(atom);
    }

    /**
     * Get all atoms in the space
     */
    all() {
        return [...this.atoms, ...this._getRulesAsAtoms()];
    }

    /**
     * Get rules as atoms
     */
    _getRulesAsAtoms() {
        return this.ruleIndex.allRules
            .filter(r => r.result && typeof r.result !== 'function' && r.pattern)
            .map(r => exp(sym('='), [r.pattern, r.result]));
    }

    /**
     * Add a rule to the space
     */
    addRule(pattern, result) {
        if (!pattern) throw new Error("Pattern cannot be null");
        const rule = { pattern, result };
        // We track explicit rules separately? Original code pushed to this.rules array.
        // RuleIndex manages allRules.
        // But `this.rules` array was used in original Space.js to store rule objects {pattern, result}.
        // RuleIndex expects an object that has a pattern property for indexing.
        // If we add it to RuleIndex, it's indexed.
        this.ruleIndex.addRule(rule);
        return this;
    }

    /**
     * Get all rules in the space
     * Filters out unit clauses (facts) to return only explicit rules (with results)
     */
    getRules() {
        return this.ruleIndex.allRules.filter(r => r.result !== undefined && r.result !== null);
    }

    rulesFor(term) {
        return this.ruleIndex.rulesFor(term);
    }

    /**
     * Get the number of atoms in the space
     */
    size() {
        return this.atoms.size;
    }

    /**
     * Get the number of atoms in the space (alias for size)
     */
    getAtomCount() {
        return this.atoms.size;
    }

    /**
     * Get statistics about the space
     */
    getStats() {
        return {
            ...this._stats,
            atomCount: this.atoms.size,
            ruleCount: this.ruleIndex.allRules.length,
            indexedFunctors: this.ruleIndex.functorIndex.size,
            indexStats: this.ruleIndex.getStats()
        };
    }

    /**
     * Get statistics about the space (alias for getStats)
     */
    stats() {
        return this.getStats();
    }

    /**
     * Query the space for atoms matching a pattern
     */
    query(pattern) {
        this._stats.queries++;
        return Array.from(this.atoms).filter(atom => atom.equals?.(pattern));
    }

    /**
     * Clear all atoms and rules from the space
     */
    clear() {
        this.atoms.clear();
        this.ruleIndex.clear();
        this._stats = { adds: 0, removes: 0, queries: 0 };
    }
}
