/**
 * AlgebraicOps.js
 * MORK-parity Phase P2-A: Algebraic Hypergraph Operations
 */
import { Space } from '../Space.js';
import { Unify } from '../Unify.js';
import { isExpression, isVariable } from '../Term.js';

export const AlgebraicOps = {
    /**
     * Relational composition of two spaces.
     * Left join atoms of S1 whose conclusions unify with heads in S2
     */
    compose: (s1, s2) => {
        const resultSpace = new Space();
        const s1Atoms = s1.all();
        const s2Atoms = s2.all();

        for (const atom1 of s1Atoms) {
            // Treat atom1 as A -> B, where B is the conclusion
            // For simple atoms without explicit rules, we try to match the entire atom against S2 rules
            let conclusion = atom1;
            if (isExpression(atom1) && (atom1.operator?.name === '=' || atom1.operator === '=') && atom1.components?.length === 2) {
                conclusion = atom1.components[1];
            }

            for (const atom2 of s2Atoms) {
                let head = atom2;
                if (isExpression(atom2) && (atom2.operator?.name === '=' || atom2.operator === '=') && atom2.components?.length === 2) {
                    head = atom2.components[0];
                }

                const bindings = Unify.unify(conclusion, head);
                if (bindings) {
                    // MORK algebraic compose implies adding the composed rule or atom
                    // If A->B and B->C, we get A->C
                    if (isExpression(atom1) && isExpression(atom2) &&
                        (atom1.operator?.name === '=' || atom1.operator === '=') &&
                        (atom2.operator?.name === '=' || atom2.operator === '=')) {

                        const newRule = Unify.subst(atom2.components[1], bindings);
                        const newPattern = Unify.subst(atom1.components[0], bindings);
                        resultSpace.addRule(newPattern, newRule);
                    } else {
                        // Fallback: add the substituted atom2 conclusion
                        resultSpace.add(Unify.subst(atom2, bindings));
                    }
                }
            }
        }
        return resultSpace;
    },

    /**
     * Filter projection by predicate
     * Space.all() filtered via unification with Pred
     */
    project: (space, pred) => {
        const resultSpace = new Space();
        for (const atom of space.all()) {
            if (Unify.unify(pred, atom)) {
                resultSpace.add(atom);
            }
        }
        return resultSpace;
    },

    /**
     * Join on shared variable Key
     * Hash-join via Map<string,atom[]> keyed on Key bindings
     */
    join: (s1, s2, key) => {
        const resultSpace = new Space();
        if (!isVariable(key)) return resultSpace;

        const map1 = new Map();

        // Build phase: S1
        for (const atom of s1.all()) {
            const bindings = Unify.unify(key, atom);
            if (bindings && bindings[key.name] !== undefined) {
                const keyValue = bindings[key.name];
                const keyStr = keyValue.name || keyValue.toString();
                if (!map1.has(keyStr)) map1.set(keyStr, []);
                map1.get(keyStr).push(atom);
            }
        }

        // Probe phase: S2
        for (const atom of s2.all()) {
            const bindings = Unify.unify(key, atom);
            if (bindings && bindings[key.name] !== undefined) {
                const keyValue = bindings[key.name];
                const keyStr = keyValue.name || keyValue.toString();
                if (map1.has(keyStr)) {
                    // Join successful, add both atoms or their combination.
                    // Returning a combined expression as a simple join representation.
                    for (const s1Atom of map1.get(keyStr)) {
                        // We could construct an expression: (join-result s1Atom atom)
                        // Here we just add both to the result space as per typical flat space join semantics
                        // Or add a tuple representing the join. Let's add them both.
                        resultSpace.add(s1Atom);
                        resultSpace.add(atom);
                    }
                }
            }
        }

        return resultSpace;
    }
};
