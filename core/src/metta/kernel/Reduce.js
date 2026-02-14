/**
 * Reduce.js - Single-step rewriting and full reduction
 * Core evaluation engine for MeTTa
 */

import { isExpression, isSymbol, exp, sym, isList, flattenList, constructList } from './Term.js';
import { Unify } from './Unify.js';

/**
 * Perform a single reduction step on an atom
 * @param {Object} atom - Atom to reduce
 * @param {Space} space - Space containing rules
 * @param {Object} ground - Grounded operations registry
 * @returns {Object} Object with reduced atom and applied flag
 */
export function step(atom, space, ground) {
    // If atom is not an expression, it's already reduced
    if (!isExpression(atom)) {
        return { reduced: atom, applied: false };
    }

    // Check if this is a grounded operation call (using ^ operator)
    const isGroundedOp = atom.operator === '^' || (atom.operator && atom.operator.name === '^');

    if (isExpression(atom) && isGroundedOp) {
        // Format: (^ &operation arg1 arg2 ...)
        if (atom.components && atom.components.length >= 1) {
            const opSymbol = atom.components[0];
            // Check if opSymbol is a symbol atom starting with &
            if (opSymbol.type === 'atom' && opSymbol.name && opSymbol.name.startsWith('&')) {
                if (ground.has(opSymbol.name)) {
                    // Extract arguments (skip the operation symbol)
                    const args = atom.components.slice(1);

                // Reduce arguments before passing to grounded operation
                // This ensures operations like &+ or &empty? receive reduced values
                const reducedArgs = args.map(arg => reduce(arg, space, ground));

                    try {
                        // Execute the grounded operation
                    const result = ground.execute(opSymbol.name, ...reducedArgs);
                        return { reduced: result, applied: true };
                    } catch (error) {
                        // If execution fails, return original atom
                        return { reduced: atom, applied: false };
                    }
                }
            }
        }
    }

    // Look for matching rules in the space
    // We use rulesFor to leverage indexing
    const rules = space.rulesFor(atom);

    for (const rule of rules) {
        // Ensure it is a rule (has pattern), not just an indexed atom
        if (!rule.pattern) continue;

        // Rule format: { pattern, result }
        // Try to unify the atom with the pattern
        // Note: unify(pattern, term) -> pattern variables bound to term values
        const bindings = Unify.unify(rule.pattern, atom);

        if (bindings !== null) {
            // Apply bindings to the result
            if (typeof rule.result === 'function') {
                // If result is a function, call it with bindings
                const result = rule.result(bindings);
                return { reduced: result, applied: true };
            } else {
                // If result is a term, substitute bindings
                const substituted = Unify.subst(rule.result, bindings);
                return { reduced: substituted, applied: true };
            }
        }
    }

    // If no reduction is possible, return the original atom
    return { reduced: atom, applied: false };
}

/**
 * Perform full reduction of an atom
 * @param {Object} atom - Atom to reduce
 * @param {Space} space - Space containing rules
 * @param {Object} ground - Grounded operations registry
 * @param {number} limit - Maximum reduction steps (default: 1000)
 * @returns {Object} Fully reduced atom
 */
export function reduce(atom, space, ground, limit = 1000) {
    let current = atom;
    let steps = 0;

    while (steps < limit) {
        const { reduced, applied } = step(current, space, ground);

        if (applied) {
            // Even if the result is the same (e.g. (= (loop x) (loop x))),
            // we count it as a step to catch infinite loops
            current = reduced;
            steps++;
            continue;
        }

        // If top-level didn't reduce, try reducing components
        if (isExpression(current)) {
            // OPTIMIZATION: Iterative reduction for lists to avoid stack overflow
            if (isList(current)) {
                const { elements, tail } = flattenList(current);
                const reducedElements = elements.map(c => reduce(c, space, ground, Math.max(1, limit - steps)));
                const reducedTail = reduce(tail, space, ground, Math.max(1, limit - steps));

                // Reconstruct list
                const newCurrent = constructList(reducedElements, reducedTail);

                if (!newCurrent.equals(current)) {
                    current = newCurrent;
                    steps++;
                    continue;
                }
            } else {
                // Normal expression reduction
                const newComponents = current.components.map(c => reduce(c, space, ground, Math.max(1, limit - steps)));

                // Check if any component changed
                let changed = false;
                for (let i = 0; i < newComponents.length; i++) {
                    if (!newComponents[i].equals(current.components[i])) {
                        changed = true;
                        break;
                    }
                }

                if (changed) {
                    current = exp(current.operator, newComponents);
                    steps++;
                    // After component reduction, try reducing top-level again
                    continue;
                }
            }
        }

        // No change at top level or components
        return current;
    }

    // If we hit the limit, throw an error
    throw new Error(`Max reduction steps (${limit}) exceeded`);
}

/**
 * Check if an atom is a grounded operation call
 * @param {Object} atom - Atom to check
 * @param {Object} ground - Grounded operations registry
 * @returns {boolean} True if atom is a grounded call
 */
export function isGroundedCall(atom, ground) {
    if (!isExpression(atom)) {
        return false;
    }

    // Check if it's a call using ^ operator with grounded operation
    const isGroundedOp = atom.operator === '^' || (atom.operator && atom.operator.name === '^');

    if (isGroundedOp && atom.components && atom.components.length > 0) {
        const opSymbol = atom.components[0];
        if (opSymbol.type === 'atom' && opSymbol.name && opSymbol.name.startsWith('&')) {
            return ground.has(opSymbol.name);
        }
    }

    return false;
}

/**
 * Perform non-deterministic reduction (returns all possible results)
 * @param {Object} atom - Atom to reduce
 * @param {Space} space - Space containing rules
 * @param {Object} ground - Grounded operations registry
 * @param {number} limit - Maximum reduction steps (default: 100)
 * @returns {Array} Array of possible reduced atoms
 */
export function reduceND(atom, space, ground, limit = 100) {
    const results = new Set();
    const visited = new Set();
    const queue = [{ atom, steps: 0 }];

    while (queue.length > 0) {
        const { atom: current, steps } = queue.shift();

        if (steps >= limit) {
            results.add(current);
            continue;
        }

        // Avoid infinite loops
        const currentStr = current.toString();
        if (visited.has(currentStr)) {
            continue;
        }
        visited.add(currentStr);

        // Try to reduce the current atom
        const { reduced, applied } = step(current, space, ground);

        // If reduction didn't change the atom, we're done
        if (!applied || (reduced.equals && reduced.equals(current))) {
            results.add(reduced);
            continue;
        }

        // Add the reduced atom to results and continue exploring
        results.add(reduced);
        queue.push({ atom: reduced, steps: steps + 1 });
    }

    return Array.from(results);
}

/**
 * Match pattern against space and return substitutions
 * @param {Object} space - Space to match against
 * @param {Object} pattern - Pattern to match
 * @param {Object} template - Template to substitute
 * @returns {Array} Array of substituted templates
 */
export function match(space, pattern, template) {
    const results = [];

    // Use space.all() to ensure we check all atoms AND rules (which are reconstructed as atoms by space.all())
    // This allows matching against rule structures like (= (human $x) True)
    const candidates = space.all();

    for (const candidate of candidates) {
        const bindings = Unify.unify(pattern, candidate);

        if (bindings !== null) {
            const substituted = Unify.subst(template, bindings);
            results.push(substituted);
        }
    }

    return results;
}

// Compatibility export
export const Reduce = {
    step,
    reduce,
    isGroundedCall,
    reduceND,
    match
};
