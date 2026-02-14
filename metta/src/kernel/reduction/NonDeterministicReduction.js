/**
 * NonDeterministicReduction.js - Non-deterministic reduction functions
 */

import { isExpression, exp } from '../../kernel/Term.js';

/**
 * Perform non-deterministic reduction
 */
export const reduceND = (atom, space, ground, limit = 100) => {
    const results = new Set();
    const visited = new Set();
    const queue = [{ atom, steps: 0 }];

    while (queue.length) {
        const { atom: curr, steps } = queue.shift();

        // Skip if curr is undefined/null
        if (!curr) continue;

        const str = curr.toString();

        // Avoid revisiting the same atom
        if (visited.has(str)) continue;
        visited.add(str);

        if (steps >= limit) {
            results.add(curr);
            continue;
        }

        let any = false;
        const reds = [...stepYieldInternal(curr, space, ground, limit)];

        if (reds.length) {
            for (const { reduced, deadEnd } of reds) {
                any = true;
                if (!deadEnd) queue.push({ atom: reduced, steps: steps + 1 });
            }
        } else if (isExpression(curr) && curr.components?.length) {
            // If no direct reductions, try reducing subcomponents
            const sub = reduceSubcomponentsND(curr, space, ground, limit - steps);
            if (sub?.length) {
                for (const expr of sub) {
                    if (!expr.equals(curr)) {
                        queue.push({ atom: expr, steps: steps + 1 });
                        any = true;
                    }
                }
            }
        }

        if (!any) results.add(curr);
    }

    return [...results];
};

/**
 * Generator for non-deterministic reduction
 */
export function* reduceNDGenerator(atom, space, ground, limit = 100) {
    const visited = new Set();
    const queue = [{ atom, steps: 0 }];

    while (queue.length) {
        const { atom: curr, steps } = queue.shift();

        if (!curr) continue;

        const str = curr.toString();

        if (visited.has(str)) continue;
        visited.add(str);

        if (steps >= limit) {
            yield curr;
            continue;
        }

        let any = false;
        const reds = [...stepYieldInternal(curr, space, ground, limit)];

        if (reds.length) {
            for (const { reduced, deadEnd } of reds) {
                any = true;
                if (!deadEnd) queue.push({ atom: reduced, steps: steps + 1 });
            }
        } else if (isExpression(curr) && curr.components?.length) {
            const sub = reduceSubcomponentsND(curr, space, ground, limit - steps);
            if (sub?.length) {
                for (const expr of sub) {
                    if (!expr.equals(curr)) {
                        queue.push({ atom: expr, steps: steps + 1 });
                        any = true;
                    }
                }
            }
        }

        if (!any) yield curr;
    }
}

/**
 * Reduce subcomponents of an expression
 */
const reduceSubcomponentsND = (expr, space, ground, limit) => {
    const { components: comps, operator: op } = expr;

    // Try reducing each component
    for (let i = 0; i < comps.length; i++) {
        const stepResults = [...stepYieldInternal(comps[i], space, ground, limit)];
        let variants = stepResults.length > 0
            ? stepResults.filter(s => !s.deadEnd).map(s => s.reduced)
            : isExpression(comps[i]) && comps[i].components?.length
                ? reduceSubcomponentsND(comps[i], space, ground, limit)
                : [];

        if (variants.length) {
            const res = variants.map(reduced => {
                const newComps = [...comps];
                newComps[i] = reduced;
                return exp(op, newComps);
            });
            if (res.length) return res;
        }
    }

    // Try reducing the operator if it's an expression
    if (op && isExpression(op)) {
        const vars = [...stepYieldInternal(op, space, ground, limit)];
        if (vars.length) {
            const res = vars
                .filter(({ deadEnd }) => !deadEnd)
                .map(({ reduced }) => exp(reduced, comps));
            if (res.length) return res;
        }
    }
    return [];
};

/**
 * Perform non-deterministic reduction asynchronously
 */
export const reduceNDAsync = async (atom, space, ground, limit = 100) => {
    const results = new Set();
    const visited = new Set();
    const queue = [{ atom, steps: 0 }];

    while (queue.length) {
        const { atom: curr, steps } = queue.shift();

        // Skip if curr is undefined/null
        if (!curr) continue;

        const str = curr.toString();

        if (visited.has(str)) continue;
        visited.add(str);

        if (steps >= limit) {
            results.add(curr);
            continue;
        }

        let any = false;
        const reds = [];
        // Handle stepYield being a generator, explicitly iterate
        for (const r of stepYieldInternal(curr, space, ground, limit)) {
            if (r.reduced instanceof Promise) {
                r.reduced = await r.reduced;
            }
            reds.push(r);
        }

        if (reds.length) {
            for (const { reduced, deadEnd } of reds) {
                any = true;
                if (!deadEnd) queue.push({ atom: reduced, steps: steps + 1 });
            }
        } else if (isExpression(curr) && curr.components?.length) {
            const sub = await reduceSubcomponentsNDAsync(curr, space, ground, limit - steps);
            if (sub?.length) {
                for (const expr of sub) {
                    if (!expr.equals(curr)) {
                        queue.push({ atom: expr, steps: steps + 1 });
                        any = true;
                    }
                }
            }
        }

        if (!any) results.add(curr);
    }

    return [...results];
};

/**
 * Reduce subcomponents of an expression asynchronously
 */
const reduceSubcomponentsNDAsync = async (expr, space, ground, limit) => {
    const { components: comps, operator: op } = expr;

    for (let i = 0; i < comps.length; i++) {
        const stepResults = [];
        for (const r of stepYieldInternal(comps[i], space, ground, limit)) {
            if (r.reduced instanceof Promise) {
                r.reduced = await r.reduced;
            }
            stepResults.push(r);
        }

        let variants = stepResults.length > 0
            ? stepResults.filter(s => !s.deadEnd).map(s => s.reduced)
            : isExpression(comps[i]) && comps[i].components?.length
                ? await reduceSubcomponentsNDAsync(comps[i], space, ground, limit)
                : [];

        if (variants.length) {
            const res = variants.map(reduced => {
                const newComps = [...comps];
                newComps[i] = reduced;
                return exp(op, newComps);
            });
            if (res.length) return res;
        }
    }

    if (op && isExpression(op)) {
        const vars = [];
        for (const r of stepYieldInternal(op, space, ground, limit)) {
            if (r.reduced instanceof Promise) {
                r.reduced = await r.reduced;
            }
            vars.push(r);
        }

        if (vars.length) {
            const res = vars
                .filter(({ deadEnd }) => !deadEnd)
                .map(({ reduced }) => exp(reduced, comps));
            if (res.length) return res;
        }
    }
    return [];
};

// Internal functions that will be imported from StepFunctions
// These are placeholders that will be replaced when the modules are properly connected
let stepYieldInternal = null;

// This function is used to set the internal references once all modules are loaded
export const setNDInternalReferences = (stepYieldFunc) => {
    stepYieldInternal = stepYieldFunc;
};

// Internal function for use within the ND reduction
export const reduceNDInternal = (atom, space, ground, limit) => {
    return reduceND(atom, space, ground, limit);
};

// Internal function for deterministic reduction within ND context
let reduceDeterministicInternalFunc = null;

export const reduceDeterministicInternal = (atom, space, ground, limit, cache) => {
    if (reduceDeterministicInternalFunc) {
        return reduceDeterministicInternalFunc(atom, space, ground, limit, cache);
    }
    // Fallback to identity if not set
    return atom;
};

// Function to set the deterministic internal reference
export const setDeterministicInternalReference = (detReduceFunc) => {
    reduceDeterministicInternalFunc = detReduceFunc;
};
