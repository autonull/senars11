/**
 * AdvancedOps.js - Advanced interpreter operations
 */

// Kernel imports
import {grounded, Term} from '../kernel/Term.js';
import {Unify} from '../kernel/Unify.js';
import {bindingsAtomToObj, objToBindingsAtom} from '../kernel/Bindings.js';
import {Formatter} from '../kernel/Formatter.js';
import {match} from '../kernel/Reduce.js';

export function registerAdvancedOps(interpreter) {
    const {sym, exp, var: v} = Term;
    const register = (ops) => {
        for (const [name, {fn, opts}] of Object.entries(ops)) {
            interpreter.ground.register(name, fn, opts);
        }
    };

    const formatNum = n => sym(String(n));

    register({
        // Substitution operations
        '&subst': {
            fn: (a, b, c) => {
                if (c) {
                    const bindings = a.name ? {[a.name]: b} : {};
                    return Unify.subst(c, bindings, {recursive: false});
                }
                return Unify.subst(a, bindingsAtomToObj(b), {recursive: false});
            },
            opts: {lazy: true}
        },
        '&let': {
            fn: (vari, val, body) => Unify.subst(body, vari?.name ? {[vari.name]: val} : {}, {recursive: false}),
            opts: {lazy: true}
        },

        // Unification operations
        '&unify': {
            fn: (pat, term) => {
                const b = Unify.unify(pat, term);
                return b ? objToBindingsAtom(b) : sym('False');
            },
            opts: {}
        },

        // Matching operations
        '&match': {
            fn: (s, p, t) => interpreter._listify(match(interpreter.space, p, t)),
            opts: {lazy: true}
        },
        '&query': {
            fn: (p, t) => interpreter._listify(match(interpreter.space, p, t)),
            opts: {}
        },

        // Type operations
        '&type-of': {
            fn: (atom) => {
                // Query for (: atom $type) patterns in the space
                const res = match(interpreter.space, exp(':', [atom, v('type')]), v('type'));
                if (res.length > 0) {
                    // Return as grounded to prevent further reduction
                    const typeName = res[0].name || res[0].toString();
                    return grounded(typeName);
                }

                // Fallback: try structural type inference
                try {
                    const inferredType = interpreter.typeChecker?.infer(atom, {});
                    if (inferredType) {
                        const typeName = interpreter.typeChecker.typeToString(inferredType);
                        return grounded(typeName);
                    }
                } catch {
                }
                return grounded('Atom');
            },
            opts: {}
        },
        '&type-infer': {
            fn: (term) => {
                try {
                    return sym(interpreter.typeChecker?.typeToString(interpreter.typeChecker.infer(term, {})) || 'Unknown');
                } catch {
                    return sym('Error');
                }
            },
            opts: {}
        },
        '&type-check': {
            fn: (t, type) => sym(interpreter.typeChecker ? 'True' : 'False'),
            opts: {}
        },

        // Context-dependent type operations
        '&get-type': {
            // Get type of an atom from the space
            fn: (atom, space) => {
                const s = space || interpreter.space;
                // First try to find a type annotation rule (pattern: atom, result: type)
                const rules = s.rulesFor(atom);
                for (const rule of rules) {
                    // Check if this is a type annotation rule (pattern matches atom exactly)
                    if (rule.pattern && rule.result) {
                        const patternMatches = rule.pattern.name === atom.name ||
                            (rule.pattern.toString && rule.pattern.toString() === atom.toString());
                        if (patternMatches) {
                            return rule.result;
                        }
                    }
                }
                // Fallback: look for (: atom $type) expression in space (as atom or rule)
                const typePattern = exp(sym(':'), [atom, v('type')]);
                const results = match(s, typePattern, v('type'));
                return results.length ? results[0] : sym('%Undefined%');
            },
            opts: {}
        },
        '&match-types': {
            fn: (t1, t2, thenBranch, elseBranch) => {
                const isWildcard = (t) => t.name === '%Undefined%' || t.name === 'Atom';
                if (isWildcard(t1) || isWildcard(t2)) {
                    return thenBranch;
                }
                return Unify.unify(t1, t2) !== null ? thenBranch : elseBranch;
            },
            opts: {lazy: true}
        },
        '&assert-type': {
            fn: (atom, expectedType, space) => {
                const s = space || interpreter.space;
                const actualType = interpreter.ground.execute('&get-type', atom, s);

                if (actualType.name === '%Undefined%') {
                    return atom;
                }

                const bindings = Unify.unify(actualType, expectedType);
                if (bindings !== null) {
                    return atom;
                }

                return exp(sym('Error'), [atom, exp(sym('TypeError'), [expectedType, actualType])]);
            },
            opts: {lazy: true}
        },

        // Space operations
        '&get-atoms': {
            fn: () => interpreter._listify(interpreter.space.all()),
            opts: {}
        },
        '&add-atom': {
            fn: (atom) => {
                interpreter.space.add(atom);
                return atom;
            },
            opts: {}
        },
        '&rm-atom': {
            fn: (atom) => {
                interpreter.space.remove(atom);
                return atom;
            },
            opts: {}
        },

        // I/O operations
        '&println': {
            fn: (...args) => {
                console.log(...args.map(a => Formatter.toHyperonString(a)));
                return sym('()');
            },
            opts: {lazy: true}
        },

        // List operations
        '&length': {
            fn: (list) => {
                if (list?.name === '()') {
                    return formatNum(0);
                }
                if (list?.operator?.name === ':' && list?.components) {
                    const flattener = interpreter.ground._flattenExpr ? interpreter.ground : interpreter;
                    const flattened = flattener._flattenExpr ? flattener._flattenExpr(list) : interpreter._flattenToList(list);
                    return formatNum(flattened.length);
                }
                return formatNum(list?.components ? list.components.length + 1 : 1);
            },
            opts: {}
        },

        // Control flow operations
        '&if': {
            fn: (cond, thenB, elseB) => {
                const results = interpreter.evaluate(cond);
                const condRes = Array.isArray(results) ? (results.length > 0 ? results[0] : null) : results;

                if (condRes?.name === 'True') {
                    return thenB;
                }
                if (condRes?.name === 'False') {
                    return elseB;
                }
                return exp(sym('if'), [condRes || cond, thenB, elseB]);
            },
            opts: {lazy: true}
        },
        '&let*': {
            fn: (binds, body) => interpreter._handleLetStar(binds, body),
            opts: {lazy: true}
        },

        // Higher-order function operations
        '&map-fast': {
            fn: (fn, list) => {
                const flattener = interpreter.ground._flattenExpr ? interpreter.ground : interpreter;
                const listToMap = flattener._flattenExpr ? flattener._flattenExpr(list) : interpreter._flattenToList(list);
                return interpreter._listify(listToMap.map(el =>
                    interpreter._reduceDeterministic(exp(fn, [el]))
                ));
            },
            opts: {lazy: true}
        },
        '&filter-fast': {
            fn: (pred, list) => {
                const flattener = interpreter.ground._flattenExpr ? interpreter.ground : interpreter;
                const listToFilter = flattener._flattenExpr ? flattener._flattenExpr(list) : interpreter._flattenToList(list);

                const filtered = listToFilter.filter(el => {
                    if (!el) {
                        return false;
                    }
                    try {
                        const expr = exp(pred, [el]);
                        const result = interpreter._reduceDeterministic(expr);
                        return interpreter._truthy(result);
                    } catch (e) {
                        return false;
                    }
                });
                return interpreter._listify(filtered);
            },
            opts: {lazy: true}
        },
        '&foldl-fast': {
            fn: (fn, init, list) => {
                const flattener = interpreter.ground._flattenExpr ? interpreter.ground : interpreter;
                const listToFold = flattener._flattenExpr ? flattener._flattenExpr(list) : interpreter._flattenToList(list);

                return listToFold.reduce((acc, el) =>
                    interpreter._reduceDeterministic(exp(fn, [acc, el])), init);
            },
            opts: {lazy: true}
        },
        'reduce-atom': {
            fn: (list, accVar, elVar, op) => {
                const flattener = interpreter.ground._flattenExpr ? interpreter.ground : interpreter;
                const elements = flattener._flattenExpr ? flattener._flattenExpr(list) : interpreter._flattenToList(list);

                if (elements.length === 0) {
                    return sym('()');
                }

                return elements.slice(1).reduce((result, el) => {
                    const substOp = Unify.subst(op, {[accVar.name]: result, [elVar.name]: el});
                    return interpreter._reduceDeterministic(substOp);
                }, elements[0]);
            },
            opts: {lazy: true}
        }
    });
}
