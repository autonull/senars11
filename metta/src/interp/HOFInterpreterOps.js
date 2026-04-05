/**
 * HOFInterpreterOps.js - Higher-order function operations with interpreter awareness
 */

import {Term} from '../kernel/Term.js';
import {Unify} from '../kernel/Unify.js';
import {reduce} from '../kernel/Reduce.js';

export function registerHofOps(interpreter) {
    const {sym, exp, isExpression} = Term;
    const reg = (n, fn, opts) => interpreter.ground.register(n, fn, opts);

    // Override HOF operations with interpreter-aware versions
    reg('map-atom-fast', (list, varName, transformFn) => {
        const flattener = interpreter.ground._flattenExpr ? interpreter.ground : interpreter;
        const elements = flattener._flattenExpr ? flattener._flattenExpr(list) : interpreter._flattenToList(list);

        const mapped = elements.map(el => reduce(
            Unify.subst(transformFn, {[varName.name]: el}),
            interpreter.space,
            interpreter.ground,
            interpreter.config.maxReductionSteps,
            interpreter.memoCache
        ));
        return interpreter.ground._listify(mapped);
    }, {lazy: true});

    reg('filter-atom-fast', (list, varName, predFn) => {
        const flattener = interpreter.ground._flattenExpr ? interpreter.ground : interpreter;
        const elements = flattener._flattenExpr ? flattener._flattenExpr(list) : interpreter._flattenToList(list);

        const filtered = elements.filter(el =>
            interpreter.ground._truthy(reduce(
                Unify.subst(predFn, {[varName.name]: el}),
                interpreter.space,
                interpreter.ground,
                interpreter.config.maxReductionSteps,
                interpreter.memoCache
            ))
        );
        return interpreter.ground._listify(filtered);
    }, {lazy: true});

    reg('foldl-atom-fast', (list, init, aVar, bVar, opFn) => {
        const flattener = interpreter.ground._flattenExpr ? interpreter.ground : interpreter;
        const elements = flattener._flattenExpr ? flattener._flattenExpr(list) : interpreter._flattenToList(list);

        return elements.reduce((acc, el) => {
            const substituted = Unify.subst(opFn, {[aVar.name]: acc, [bVar.name]: el});
            return reduce(substituted, interpreter.space, interpreter.ground, interpreter.config.maxReductionSteps, interpreter.memoCache);
        }, init);
    }, {lazy: true});
}
