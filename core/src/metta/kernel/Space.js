/**
 * Space.js - Set of atoms with functor indexing
 * Core storage and retrieval mechanism for MeTTa programs
 */

import { isExpression, isSymbol, exp, sym } from './Term.js';

export class Space {
    constructor() {
        // Main storage for atoms
        this.atoms = new Set();

        // Storage for rules (rewrite rules)
        this.rules = [];

        // Functor index for efficient rule lookup
        // Maps functor names to sets of matching rules
        this.functorIndex = new Map();

        // Stats for performance monitoring
        this.stats = {
            adds: 0,
            removes: 0,
            queries: 0,
            indexedLookups: 0
        };
    }

    /**
     * Add an atom to the space
     * @param {Object} atom - Atom to add
     * @returns {Space} This space for chaining
     */
    add(atom) {
        if (!atom) {
            throw new Error("Cannot add null/undefined atom");
        }

        if (!this.atoms.has(atom)) {
            this.atoms.add(atom);
            this._indexAtom(atom);
            this.stats.adds++;
        }
        return this;
    }

    /**
     * Remove an atom from the space
     * @param {Object} atom - Atom to remove
     * @returns {boolean} True if atom was removed
     */
    remove(atom) {
        if (this.atoms.has(atom)) {
            this.atoms.delete(atom);
            this._deindexAtom(atom);
            this.stats.removes++;
            return true;
        }
        return false;
    }

    /**
     * Check if space contains an atom
     * @param {Object} atom - Atom to check
     * @returns {boolean} True if atom is in space
     */
    has(atom) {
        return this.atoms.has(atom);
    }

    /**
     * Get all atoms in the space (including rules)
     * @returns {Array} Array of all atoms
     */
    all() {
        const atoms = Array.from(this.atoms);
        // Reconstruct rules as atoms (= pattern result)
        // We need to import exp/sym, but since this is kernel, maybe pass factory or use structure?
        // We can't easily import exp here without circular dep potential or changing Term.js?
        // Term.js is leaf. Space.js imports Term.js? Yes.
        // So we can use exp/sym.

        // Dynamic import or assume exp imported at top
        // Checking imports... "import { isExpression, isSymbol } from './Term.js';"
        // Need to add exp to imports.

        const rulesAsAtoms = this.rules.map(rule => {
             return exp(sym('='), [rule.pattern, rule.result]);
        });

        return [...atoms, ...rulesAsAtoms];
    }

    /**
     * Add a rewrite rule to the space
     * @param {Object} pattern - Pattern to match
     * @param {Object|Function} result - Result to return (either a term or a function that takes bindings and returns a term)
     * @returns {Space} This space for chaining
     */
    addRule(pattern, result) {
        if (!pattern) {
            throw new Error("Pattern cannot be null or undefined");
        }

        const rule = { pattern, result };
        this.rules.push(rule);

        // Also index the rule by its pattern's functor if it's an expression
        if (isExpression(pattern)) {
            let functorName = null;
            if (typeof pattern.operator === 'string') {
                functorName = pattern.operator;
            } else if (isSymbol(pattern.operator)) {
                functorName = pattern.operator.name;
            }

            if (functorName) {
                if (!this.functorIndex.has(functorName)) {
                    this.functorIndex.set(functorName, []);
                }
                this.functorIndex.get(functorName).push(rule);
            }
        }

        return this;
    }

    /**
     * Get all rules in the space
     * @returns {Array} Array of rules
     */
    getRules() {
        return [...this.rules];
    }

    /**
     * Get rules for a specific functor/operator
     * @param {string|Object} functor - Functor name or atom
     * @returns {Array} Matching rules
     */
    rulesFor(functor) {
        this.stats.indexedLookups++;

        if (typeof functor === 'string') {
            return this.functorIndex.get(functor) || [];
        }

        if (isSymbol(functor)) {
            return this.functorIndex.get(functor.name) || [];
        } else if (isExpression(functor)) {
            if (typeof functor.operator === 'string') {
                return this.functorIndex.get(functor.operator) || [];
            } else if (isSymbol(functor.operator)) {
                return this.functorIndex.get(functor.operator.name) || [];
            }
        }

        // If functor is not a symbol, return all rules
        return [...this.rules];
    }

    /**
     * Index an atom for faster lookup
     * @private
     * @param {Object} atom - Atom to index
     */
    _indexAtom(atom) {
        // Only index atoms (not rules) in the functor index
        if (isExpression(atom)) {
            let functorName = null;
            if (typeof atom.operator === 'string') {
                functorName = atom.operator;
            } else if (isSymbol(atom.operator)) {
                functorName = atom.operator.name;
            }

            if (functorName) {
                if (!this.functorIndex.has(functorName)) {
                    this.functorIndex.set(functorName, []);
                }
                this.functorIndex.get(functorName).push(atom);
            }
        }
    }

    /**
     * Remove atom from index
     * @private
     * @param {Object} atom - Atom to deindex
     */
    _deindexAtom(atom) {
        if (isExpression(atom)) {
            let functorName = null;
            if (typeof atom.operator === 'string') {
                functorName = atom.operator;
            } else if (isSymbol(atom.operator)) {
                functorName = atom.operator.name;
            }

            if (functorName) {
                if (this.functorIndex.has(functorName)) {
                    const items = this.functorIndex.get(functorName);
                    const index = items.indexOf(atom);
                    if (index !== -1) {
                        items.splice(index, 1);
                        if (items.length === 0) {
                            this.functorIndex.delete(functorName);
                        }
                    }
                }
            }
        }
    }

    /**
     * Clear all atoms from the space
     */
    clear() {
        this.atoms.clear();
        this.rules = [];
        this.functorIndex.clear();
        this.stats = {
            adds: 0,
            removes: 0,
            queries: 0,
            indexedLookups: 0
        };
    }

    /**
     * Size of the space
     * @returns {number} Number of atoms in space
     */
    size() {
        return this.atoms.size;
    }

    /**
     * Get statistics about the space
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            atomCount: this.atoms.size,
            functorCount: this.functorIndex.size,
            indexedFunctors: this.functorIndex.size, // Alias for tests
            ruleCount: this.rules.length
        };
    }

    /**
     * Get space statistics (alias for getStats)
     * @returns {Object} Statistics object
     */
    stats() {
        // Just alias to getStats, but ensure indexedFunctors is present there or here
        // The test expects stats() to return object with indexedFunctors
        return this.getStats();
    }

    /**
     * Query space with a pattern
     * @param {Object} pattern - Pattern to match
     * @returns {Array} Matching atoms
     */
    query(pattern) {
        this.stats.queries++;

        // For now, do a linear scan
        // In a full implementation, this would use more sophisticated indexing
        const results = [];
        for (const atom of this.atoms) {
            // Simple structural match for now
            if (atom.equals && atom.equals(pattern)) {
                results.push(atom);
            }
        }
        return results;
    }
}
