/**
 * StepFunctions.js - Single-step reduction functions
 * Updated with Tier 1 Performance Optimizations:
 * - Reduction Caching (Q5)
 * - Grounded Operation Fast Lookup (Q4)
 * - Critical Bug Fix: reduceNDInternalFunc is now imported/used correctly
 */

import { isExpression, exp, isList, flattenList } from '../../kernel/Term.js';
import { Unify } from '../../kernel/Unify.js';
import { METTA_CONFIG } from '../../config.js';
import {Logger} from '../../../../core/src/util/Logger.js';

// Internal function for non-deterministic reduction within ND context
let reduceNDInternalFunc = null;

// Internal function for deterministic reduction within ND context
let reduceDeterministicInternalFunc = null;

/**
 * Yield possible reductions for an atom
 */
export function* stepYield(atom, space, ground, limit = 10000, cache = null) {
    if (!isExpression(atom)) return;

    // Q5: Check cache first
    if (METTA_CONFIG.caching && cache) {
        const cached = cache.get(atom);
        if (cached !== undefined) {
            yield { reduced: cached, applied: true };
            return;
        }
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
    // Q4: Optimized lookup is handled inside Ground.has/execute via symbol._opId
    // Note: Special handling for ^ (Call) to avoid duplicate execution if it's also registered
    if (opName && opName !== '^' && ground.has(atom.operator)) {
        let applied = false;
        for (const res of executeGroundedOpND(atom, atom.operator, space, ground, limit)) {
            if (res.applied) {
                applied = true;
                // Q5: Cache result
                if (METTA_CONFIG.caching && cache) {
                    cache.set(atom, res.reduced);
                }
                yield res;
            }
        }
        if (applied) return;
    }

    // Handle explicit grounded call (^)
    if (opName === '^' && comps && comps.length > 0) {
        // Handle cases where comps[0] might be an object or string
        const opCandidate = comps[0];
        // Check if grounded: try object directly, or name if available
        if (ground.has(opCandidate) || (opCandidate.name && ground.has(opCandidate.name))) {
            const op = opCandidate;
            const args = comps.slice(1);
            let applied = false;
            for (const res of executeGroundedOpWithArgsND(atom, op, args, space, ground, limit)) {
                if (res.applied) {
                    applied = true;
                    // Q5: Cache result
                    if (METTA_CONFIG.caching && cache) {
                        cache.set(atom, res.reduced);
                    }
                    yield res;
                }
            }
            if (applied) return;
        }
    }

    // Handle rule matching
    for (const rule of space.rulesFor(atom)) {
        if (!rule.pattern) continue;
        const bindings = Unify.unify(rule.pattern, atom);
        if (bindings) {
            const reduced = typeof rule.result === 'function'
                ? rule.result(bindings)
                : Unify.subst(rule.result, bindings);

            if (reduced !== undefined && reduced !== null) {
                // Q5: Cache result (for deterministic rules)
                // Note: We only cache if this is the only result or if the rule is marked deterministic
                // For now, simple caching strategy
                if (METTA_CONFIG.caching && cache) {
                    cache.set(atom, reduced);
                }
                yield { reduced, applied: true };
            }
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

// Function to set the internal reference for ND reduction
export const setReduceNDInternalReference = (ndReduceFunc) => {
    reduceNDInternalFunc = ndReduceFunc;
};

// Function to set the internal reference for Deterministic reduction
export const setReduceDeterministicInternalReference = (detReduceFunc) => {
    reduceDeterministicInternalFunc = detReduceFunc;
};

/**
 * Execute a grounded operation with non-deterministic evaluation
 */
export function* executeGroundedOpND(atom, op, space, ground, limit) {
    const args = atom.components;

    // If operation is lazy, execute directly without reducing arguments
    if (ground.isLazy(op)) {
        try {
            yield { reduced: ground.execute(op, ...args), applied: true };
        } catch (e) {
            Logger.error('Lazy op error', { op, error: e });
        }
        return;
    }

    // Special handling for certain operations that need deterministic evaluation of arguments
    // For example, &if should evaluate the condition deterministically first
    const opStr = typeof op === 'string' ? op : op.name;
    if (opStr === '&if' && args.length >= 3) {
        // Bug Fix: Check if reduceNDInternalFunc is available
        if (!reduceNDInternalFunc) {
             // Fallback if not initialized yet, shouldn't happen in proper flow
             yield { reduced: atom, applied: false };
             return;
        }

        // Evaluate the condition deterministically first
        // If deterministic reduction is available, use it. Otherwise fall back to ND reduction (take first)
        let conditionResult = null;

        if (reduceDeterministicInternalFunc) {
             conditionResult = reduceDeterministicInternalFunc(args[0], space, ground, limit, null);
        } else {
             // Fallback: reduce first arg using ND
             const conditionVariants = reduceNDInternalFunc(args[0], space, ground, limit);
             if (conditionVariants.length > 0) {
                 conditionResult = conditionVariants[0];
             }
        }

        // Then evaluate the appropriate branch based on the condition
        if (conditionResult) {
            if (conditionResult.name === 'True') {
                yield { reduced: args[1], applied: true };
            } else if (conditionResult.name === 'False') {
                yield { reduced: args[2], applied: true };
            } else {
                // If condition is not clearly True/False, return the original expression
                yield { reduced: atom, applied: false };
            }
        } else {
             yield { reduced: atom, applied: false };
        }
        return;
    }

    // Check if ND reduction is initialized
    if (!reduceNDInternalFunc) {
        Logger.warn('reduceNDInternalFunc not initialized in executeGroundedOpND');
        yield { reduced: atom, applied: false };
        return;
    }

    // Reduce arguments first to get all possible values
    const variants = args.map(arg => reduceNDInternalFunc(arg, space, ground, limit));

    // If any argument has no results, return nothing
    if (variants.some(v => v.length === 0)) return;

    // Generate all combinations of argument values
    for (const combo of cartesianProduct(variants)) {
        try {
            const res = ground.execute(op, ...combo);
            if (res === undefined || res === null) throw new Error(`Grounded op ${op} returned ${res}`);
            yield { reduced: res, applied: true };
        } catch (e) {
            Logger.error('Grounded op error', { op, error: e });
        }
    }
}

/**
 * Execute a grounded operation with specific arguments
 */
export function* executeGroundedOpWithArgsND(atom, op, args, space, ground, limit) {
    if (ground.isLazy(op)) {
        try {
            const res = ground.execute(op, ...args);
            if (res === undefined || res === null) throw new Error(`Lazy op ${op} returned ${res}`);
            yield { reduced: res, applied: true };
        } catch (e) {
            Logger.error('Lazy op args error', { op, error: e });
        }
        return;
    }

    if (!reduceNDInternalFunc) {
        Logger.warn('reduceNDInternalFunc not initialized in executeGroundedOpWithArgsND');
        return;
    }

    const variants = args.map(arg => reduceNDInternalFunc(arg, space, ground, limit));
    if (variants.some(v => v.length === 0)) return;

    for (const combo of cartesianProduct(variants)) {
        try {
            const res = ground.execute(op, ...combo);
            if (res === undefined || res === null) throw new Error(`Grounded op ${op} returned ${res}`);
            yield { reduced: res, applied: true };
        } catch (e) {
            Logger.error('Grounded op args error', { op, error: e });
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
    const op = atom.operator;
    if (op && ground.has(op)) return true;

    // Explicit call (^)
    if (op?.name === '^' && atom.components?.[0]) {
        return ground.has(atom.components[0]);
    }
    return false;
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
