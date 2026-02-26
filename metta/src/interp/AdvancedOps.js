/**
 * AdvancedOps.js - Advanced interpreter operations
 */

// Kernel imports
import { Term } from '../kernel/Term.js';
import { Unify } from '../kernel/Unify.js';
import { objToBindingsAtom, bindingsAtomToObj } from '../kernel/Bindings.js';
import { Formatter } from '../kernel/Formatter.js';
import { match, reduce } from '../kernel/Reduce.js';

export function registerAdvancedOps(interpreter) {
    const { sym, exp, var: v } = Term;
    const register = (ops) => {
        for (const [name, { fn, opts }] of Object.entries(ops)) {
            interpreter.ground.register(name, fn, opts);
        }
    };

    const formatNum = n => sym(String(n));

    register({
        // Substitution operations
        '&subst': {
            fn: (a, b, c) => c
                ? Unify.subst(c, a.name ? { [a.name]: b } : {}, { recursive: false })
                : Unify.subst(a, bindingsAtomToObj(b), { recursive: false }),
            opts: { lazy: true }
        },
        '&let': {
            fn: (vari, val, body) => Unify.subst(body, vari?.name ? { [vari.name]: val } : {}, { recursive: false }),
            opts: { lazy: true }
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
            opts: { lazy: true }
        },
        '&query': {
            fn: (p, t) => interpreter._listify(match(interpreter.space, p, t)),
            opts: {}
        },

        // Type operations
        '&type-of': {
            fn: (atom) => {
                const res = match(interpreter.space, exp(':', [atom, v('type')]), v('type'));
                return res.length ? res[0] : sym('Atom');
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
        'get-type': {
            fn: (atom, space) => {
                const s = space || interpreter.space;
                const typePattern = exp(sym(':'), [atom, v('type')]);
                const results = match(s, typePattern, v('type'));
                return results.length ? results[0] : sym('%Undefined%');
            },
            opts: { lazy: true }
        },
        'match-types': {
            fn: (t1, t2, thenBranch, elseBranch) => {
                if (t1.name === '%Undefined%' || t2.name === '%Undefined%' ||
                    t1.name === 'Atom' || t2.name === 'Atom') {
                    return thenBranch;
                }
                const bindings = Unify.unify(t1, t2);
                return bindings !== null ? thenBranch : elseBranch;
            },
            opts: { lazy: true }
        },
        'assert-type': {
            fn: (atom, expectedType, space) => {
                const s = space || interpreter.space;
                const actualType = interpreter.ground.execute('&get-type', atom, s);

                if (actualType.name === '%Undefined%') return atom;

                const bindings = Unify.unify(actualType, expectedType);
                if (bindings !== null) return atom;

                return exp(sym('Error'), [atom, exp(sym('TypeError'), [expectedType, actualType])]);
            },
            opts: { lazy: true }
        },

        // Space operations
        '&get-atoms': {
            fn: () => interpreter._listify(interpreter.space.all()),
            opts: {}
        },
        '&add-atom': {
            fn: (atom) => { interpreter.space.add(atom); return atom; },
            opts: {}
        },
        '&rm-atom': {
            fn: (atom) => { interpreter.space.remove(atom); return atom; },
            opts: {}
        },

        // I/O operations
        '&println': {
            fn: (...args) => {
                console.log(...args.map(a => Formatter.toHyperonString(a)));
                return sym('()');
            },
            opts: {}
        },

        // List operations
        '&length': {
            fn: (list) => {
                if (list?.name === '()') return formatNum(0);
                if (list?.operator?.name === ':' && list?.components) {
                    const flattened = interpreter.ground._flattenExpr(list);
                    return formatNum(flattened.length);
                }
                return formatNum(list?.components ? list.components.length + 1 : 1);
            },
            opts: {}
        },

        // Control flow operations
        '&if': {
            fn: (cond, thenB, elseB) => {
                const res = interpreter._reduceDeterministic(cond);
                if (res.name === 'True') return interpreter._reduceDeterministic(thenB);
                if (res.name === 'False') return interpreter._reduceDeterministic(elseB);
                return exp('if', [res, thenB, elseB]);
            },
            opts: { lazy: true }
        },
        '&let*': {
            fn: (binds, body) => interpreter._handleLetStar(binds, body),
            opts: { lazy: true }
        },

        // Higher-order function operations
        '&map-fast': {
            fn: (fn, list) => interpreter._listify(interpreter.ground._flattenExpr(list).map(el =>
                interpreter._reduceDeterministic(exp(fn, [el]))
            )),
            opts: { lazy: true }
        },
        '&filter-fast': {
            fn: (pred, list) => {
                const elements = interpreter.ground._flattenExpr(list);
                const filtered = elements.filter(el => {
                    if (!el) return false;
                    try {
                        const expr = exp(pred, [el]);
                        const result = interpreter._reduceDeterministic(expr);
                        return interpreter.ground._truthy(result);
                    } catch (e) {
                        return false;
                    }
                });
                return interpreter.ground._listify(filtered);
            },
            opts: { lazy: true }
        },
        '&foldl-fast': {
            fn: (fn, init, list) => interpreter.ground._flattenExpr(list).reduce((acc, el) =>
                interpreter._reduceDeterministic(exp(fn, [acc, el])), init),
            opts: { lazy: true }
        },
        'reduce-atom': {
            fn: (list, accVar, elVar, op) => {
                const elements = interpreter.ground._flattenExpr(list);
                if (elements.length === 0) return sym('()');

                return elements.slice(1).reduce((result, el) => {
                    const substOp = Unify.subst(op, { [accVar.name]: result, [elVar.name]: el });
                    return interpreter._reduceDeterministic(substOp);
                }, elements[0]);
            },
            opts: { lazy: true }
        }
    });
}
