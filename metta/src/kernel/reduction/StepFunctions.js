/**
 * StepFunctions.js - Single-step reduction functions
 */

import { isExpression, exp, isList, flattenList } from '../../kernel/Term.js';
import { Unify } from '../../kernel/Unify.js';

/**
 * Yield possible reductions for an atom
 */
export function* stepYield(atom, space, ground, limit = 10000, cache = null) {
    if (!isExpression(atom)) return;

    // Check cache first
    const cached = cache?.get?.(atom);
    if (cached !== undefined) {
        yield { reduced: cached, applied: true };
        return;
    }

    const opName = atom.operator?.name;
    const comps = atom.components;

    // Handle superposition (internal primitive)
    // superpose creates (superpose-internal A B C...) where each component is an alternative
    if (opName === 'superpose-internal' && comps?.length > 0) {
        // Handle empty superpose
        if (comps.length === 1 && comps[0].name === '()') {
            yield { reduced: null, applied: true, deadEnd: true };
            return;
        }

        // Each component is an alternative - yield them all
        for (const alt of comps) {
            yield { reduced: alt, applied: true };
        }
        return;
    }

    // Handle grounded operations
    if (opName && ground.has(opName)) {
        let applied = false;
        for (const res of executeGroundedOpND(atom, opName, space, ground, limit)) {
            if (res.applied) {
                applied = true;
                cache?.set(atom, res.reduced);
                yield res;
            }
        }
        if (applied) return;
    }

    // Handle explicit grounded call (^)
    if (opName === '^' && comps?.[0]?.name && ground.has(comps[0].name)) {
        const op = comps[0].name;
        const args = comps.slice(1);
        let applied = false;
        for (const res of executeGroundedOpWithArgsND(atom, op, args, space, ground, limit)) {
            if (res.applied) {
                applied = true;
                cache?.set(atom, res.reduced);
                yield res;
            }
        }
        if (applied) return;
    }

    // Handle rule matching
    for (const rule of space.rulesFor(atom)) {
        if (!rule.pattern) continue;
        const bindings = Unify.unify(rule.pattern, atom);
        if (bindings) {
            yield {
                reduced: typeof rule.result === 'function'
                    ? rule.result(bindings)
                    : Unify.subst(rule.result, bindings),
                applied: true
            };
        }
    }
}

/**
 * Perform a single reduction step
 */
export const step = (atom, space, ground, limit, cache) => {
    const gen = stepYield(atom, space, ground, limit, cache);
    const { value, done } = gen.next();
    if (!done) {
        return value.deadEnd
            ? { reduced: exp(atom.operator || atom, []), applied: true }
            : value;
    }
    return { reduced: atom, applied: false };
};

// Internal function for non-deterministic reduction within ND context
let reduceNDInternalFunc = null;

// Function to set the internal reference
export const setReduceNDInternalReference = (ndReduceFunc) => {
    reduceNDInternalFunc = ndReduceFunc;
};

/**
 * Execute a grounded operation with non-deterministic evaluation
 */
export function* executeGroundedOpND(atom, opName, space, ground, limit) {
    const args = atom.components;

    // If operation is lazy, execute directly without reducing arguments
    if (ground.isLazy(opName)) {
        try {
            yield { reduced: ground.execute(opName, ...args), applied: true };
        } catch (e) {
            console.error('Lazy op error', opName, e);
        }
        return;
    }

    // Special handling for certain operations that need deterministic evaluation of arguments
    // For example, &if should evaluate the condition deterministically first
    if (opName === '&if' && args.length >= 3) {
        // Evaluate the condition deterministically first
        const conditionResult = reduceDeterministicInternal(args[0], space, ground, limit, null);

        // Then evaluate the appropriate branch based on the condition
        if (conditionResult.name === 'True') {
            // TCO: Return branch unreduced to allow outer loop to handle it without stack growth
            yield { reduced: args[1], applied: true };
        } else if (conditionResult.name === 'False') {
            // TCO: Return branch unreduced
            yield { reduced: args[2], applied: true };
        } else {
            // If condition is not clearly True/False, return the original expression
            yield { reduced: atom, applied: false };
        }
        return;
    }

    // Reduce arguments first to get all possible values
    const variants = args.map(arg => reduceNDInternalFunc(arg, space, ground, limit));

    // If any argument has no results, return nothing
    if (variants.some(v => v.length === 0)) return;

    // Generate all combinations of argument values
    for (const combo of cartesianProduct(variants)) {
        try {
            yield { reduced: ground.execute(opName, ...combo), applied: true };
        } catch (e) {
            console.error('Grounded op error', opName, e);
        }
    }
}

/**
 * Execute a grounded operation with specific arguments
 */
export function* executeGroundedOpWithArgsND(atom, opName, args, space, ground, limit) {
    if (ground.isLazy(opName)) {
        try {
            yield { reduced: ground.execute(opName, ...args), applied: true };
        } catch (e) {
            console.error('Lazy op args error', opName, e);
        }
        return;
    }

    const variants = args.map(arg => reduceNDInternalFunc(arg, space, ground, limit));
    if (variants.some(v => v.length === 0)) return;

    for (const combo of cartesianProduct(variants)) {
        try {
            yield { reduced: ground.execute(opName, ...combo), applied: true };
        } catch (e) {
            console.error('Grounded op args error', opName, e);
        }
    }
}

/**
 * Generate Cartesian product of arrays
 */
function* cartesianProduct(arrays) {
    if (arrays.length === 0) {
        yield [];
        return;
    }

    const [head, ...tail] = arrays;
    const tailProducts = tail.length ? cartesianProduct(tail) : [[]];

    for (const h of head) {
        for (const t of tailProducts) {
            yield [h, ...t];
        }
    }
}

/**
 * Check if an atom is a grounded call
 */
export const isGroundedCall = (atom, ground) => {
    if (!isExpression(atom)) return false;
    const op = atom.operator?.name;
    return (op && ground.has(op)) ||
        (op === '^' && atom.components?.[0]?.name && ground.has(atom.components[0].name));
};

/**
 * Match atoms in space against a pattern
 */
export const match = (space, pattern, template) => {
    const res = [];
    for (const cand of space.all()) {
        const bind = Unify.unify(pattern, cand);
        if (bind) res.push(Unify.subst(template, bind));
    }
    return res;
};

/**
 * Trampolined reduction for tail calls
 */
export function reduceWithTCO(atom, space, ground, limit, cache) {
    let current = atom;
    let steps = 0;

    while (steps < limit) {
        const result = step(current, space, ground, limit, cache);

        if (!result.applied) {
            return current;
        }

        current = result.reduced;
        steps++;
    }

    throw new Error(`TCO limit exceeded: ${limit} steps`);
}
