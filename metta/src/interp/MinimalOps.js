/**
 * MinimalOps.js - Minimal core operations
 */

import { Term } from '../kernel/Term.js';
import { Unify } from '../kernel/Unify.js';
import { step, reduce, reduceND, reduceNDGenerator } from '../kernel/Reduce.js';

export function registerMinimalOps(interpreter) {
    const { sym, exp, isExpression } = Term;
    const reg = (n, fn, opts) => interpreter.ground.register(n, fn, opts);

    // Register minimal core operations
    reg('eval', createEvalOp(interpreter), { lazy: true });
    reg('chain', createChainOp(interpreter), { lazy: true });
    reg('unify', createUnifyOp(interpreter), { lazy: true });
    reg('function', createFunctionOp(interpreter), { lazy: true });
    reg('return', createReturnOp(interpreter), { lazy: true });
    reg('import!', createImportOp(interpreter), { lazy: true, async: true });
    reg('include!', createIncludeOp(interpreter), { lazy: true, async: true });
    reg('bind!', createBindOp(interpreter), { lazy: true });

    // Updated/New ops
    reg('collapse', createCollapseOp(interpreter), { lazy: true });
    reg('superpose', createSuperposeOp(interpreter), { lazy: true });
    reg('superpose-weighted', createSuperposeWeightedOp(interpreter), { lazy: true });
    reg('collapse-n', createCollapseNOp(interpreter), { lazy: true });

    reg('context-space', createContextSpaceOp(interpreter), { lazy: true });
    reg('noeval', createNoEvalOp(interpreter), { lazy: true });
}

/**
 * Create the eval operation
 */
function createEvalOp(interpreter) {
    return (atom) =>
        step(atom, interpreter.space, interpreter.ground, interpreter.config.maxReductionSteps, interpreter.memoCache).reduced;
}

/**
 * Create the chain operation
 */
function createChainOp(interpreter) {
    const { isExpression } = Term;

    return (atom, vari, templ) => {
        const res = reduce(atom, interpreter.space, interpreter.ground, interpreter.config.maxReductionSteps, interpreter.memoCache);
        return (res.name === 'Empty' || (isExpression(res) && res.operator?.name === 'Error'))
            ? res
            : Unify.subst(templ, { [vari.name]: res });
    };
}

/**
 * Create the unify operation
 */
function createUnifyOp(interpreter) {
    return (atom, pat, thenB, elseB) => {
        const b = Unify.unify(atom, pat);
        return b ? Unify.subst(thenB, b) : elseB;
    };
}

/**
 * Create the function operation
 */
function createFunctionOp(interpreter) {
    const { sym, exp, isExpression } = Term;

    return (body) => {
        let curr = body;
        const limit = interpreter.config.maxReductionSteps || 1000;

        for (let i = 0; i < limit; i++) {
            const res = step(curr, interpreter.space, interpreter.ground, limit, interpreter.memoCache);
            const red = res.reduced;

            if (isExpression(red) && red.operator?.name === 'return') {
                return red.components[0] || sym('()');
            }

            if (red === curr || red.equals?.(curr)) break;
            if (!res.applied) break;

            curr = red;
        }

        return exp(sym('Error'), [body, sym('NoReturn')]);
    };
}

/**
 * Create the return operation
 */
function createReturnOp(interpreter) {
    const { sym, exp } = Term;

    return (val) => exp(sym('return'), [val]);
}

/**
 * Create the import! operation
 */
function createImportOp(interpreter) {
    const { sym, exp } = Term;
    return async (moduleName) => {
        const module = await interpreter.moduleLoader.import(moduleName.name);
        // Merge exported symbols into current space
        if (module.exports) {
            for (const [name, atom] of Object.entries(module.exports)) {
                interpreter.space.add(exp(sym('='), [sym(name), atom]));
            }
        }
        return sym('ok');
    };
}

/**
 * Create the include! operation
 */
function createIncludeOp(interpreter) {
    const { sym } = Term;
    return async (filePath) => {
        await interpreter.moduleLoader.include(filePath.name);
        return sym('ok');
    };
}

/**
 * Create the bind! operation
 */
function createBindOp(interpreter) {
    const { sym, exp } = Term;
    return (name, value) => {
        interpreter.space.add(exp(sym('='), [name, value]));
        return sym('ok');
    };
}

/**
 * Create the collapse operation
 */
function createCollapseOp(interpreter) {
    return (atom) =>
        interpreter._listify(reduceND(atom, interpreter.space, interpreter.ground, interpreter.config.maxReductionSteps));
}

const extractElements = (atom) => {
    const { isList, flattenList, isExpression } = Term;
    if (isList(atom)) return flattenList(atom).elements;
    if (isExpression(atom)) return [atom.operator, ...atom.components];
    return [atom];
};

/**
 * Create the superpose operation
 */
function createSuperposeOp(interpreter) {
    const { sym, exp } = Term;

    return (listAtom) => {
        const elements = extractElements(listAtom);
        // Handle empty list: (superpose ()) should produce no results
        if (elements.length === 0 || (elements.length === 1 && elements[0].name === '()')) {
            return exp(sym('superpose-internal'), [sym('()')]);
        }
        if (elements.length === 1) return elements[0];
        return exp(sym('superpose-internal'), elements);
    };
}

/**
 * Create the superpose-weighted operation
 */
function createSuperposeWeightedOp(interpreter) {
    return (weightedList) => {
        const items = extractElements(weightedList);
        const weighted = items.map(item => ({
            weight: parseFloat(item.components?.[0]?.name) || 1,
            value: item.components?.[1] || item
        }));

        const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
        let random = Math.random() * totalWeight;
        for (const { weight, value } of weighted) {
            random -= weight;
            if (random <= 0) return value;
        }
        return weighted[weighted.length - 1].value;
    };
}

/**
 * Create the collapse-n operation
 */
function createCollapseNOp(interpreter) {
    return (atom, n) => {
        const limit = parseInt(n.name) || 10;
        const results = [];
        const gen = reduceNDGenerator(atom, interpreter.space, interpreter.ground);
        for (let i = 0; i < limit; i++) {
            const { value, done } = gen.next();
            if (done) break;
            results.push(value);
        }
        return interpreter._listify(results);
    };
}

/**
 * Create the context-space operation
 */
function createContextSpaceOp(interpreter) {
    return () => interpreter.space;
}

/**
 * Create the noeval operation
 */
function createNoEvalOp(interpreter) {
    return (atom) => atom;
}
