/**
 * RuleExecutor.js
 *
 * Executes the compiled rule tree against incoming tasks.
 */

import {Logger} from '@senars/core';

export class RuleExecutor {
    constructor(compiledTree, unifier, discriminators = []) {
        this.tree = compiledTree;
        this.unifier = unifier;
        this.discriminators = discriminators;
    }

    /**
     * Execute rules against a primary task and context.
     * @param {Task} p - Primary task (premise 1)
     * @param {Task} s - Secondary task (premise 2)
     * @param {Context} context - Execution context
     * @returns {Array<Task>} Derived tasks
     */
    execute(p, s, context) {
        if (!this.tree) {return [];}

        // 1. Fast Traversal (Guards)
        const candidates = this.query(p.term, s.term);

        // 2. Full Unification (Only on survivors)
        const results = [];
        for (const rule of candidates) {
            // Match pattern against concrete terms
            // Pattern has variables ($S, $P), terms have constants (or variables treated as constants)
            const matchP = this.unifier.match(rule.pattern.p, p.term);
            if (!matchP.success) {continue;}

            const matchS = this.unifier.match(rule.pattern.s, s.term, matchP.substitution);
            if (!matchS.success) {continue;}

            // 3. Execute Conclusion
            try {
                const derived = rule.conclusion(matchS.substitution, p, s, context);
                if (derived) {
                    results.push(derived);
                }
            } catch (e) {
                Logger.error(`Error executing rule ${rule.id}:`, e);
            }
        }
        return results;
    }

    query(pTerm, sTerm) {
        const values = this.discriminators.map(d => d.getInstanceValue(pTerm, sTerm));
        return this._collectRules(this.tree, values, 0);
    }

    _collectRules(node, values, depth, target = []) {
        if (node.rules.length > 0) {
            target.push(...node.rules);
        }

        if (depth >= values.length) {
            return target;
        }

        const val = values[depth];

        // Check specific branch
        const child = node.children.get(val);
        if (child) {
            this._collectRules(child, values, depth + 1, target);
        }

        // Check wildcard branch ('*')
        const wildcard = node.children.get('*');
        if (wildcard) {
            this._collectRules(wildcard, values, depth + 1, target);
        }

        return target;
    }
}
