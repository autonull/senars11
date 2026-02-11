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
    const reg = (n, fn, opts) => interpreter.ground.register(n, fn, opts);

    // Substitution operations
    reg('&subst', (a, b, c) =>
        c ? Unify.subst(c, a.name ? { [a.name]: b } : {}) : Unify.subst(a, bindingsAtomToObj(b)),
        { lazy: true }
    );

    reg('&let', (vari, val, body) =>
        Unify.subst(body, vari?.name ? { [vari.name]: val } : {}),
        { lazy: true }
    );

    // Unification operations
    reg('&unify', (pat, term) => {
        const b = Unify.unify(pat, term);
        return b ? objToBindingsAtom(b) : sym('False');
    });

    // Matching operations
    reg('&match', (s, p, t) => interpreter._listify(match(interpreter.space, p, t)), { lazy: true });
    reg('&query', (p, t) => interpreter._listify(match(interpreter.space, p, t)));

    // Type operations
    reg('&type-of', (atom) => {
        const res = match(interpreter.space, exp(':', [atom, v('type')]), v('type'));
        return res.length ? res[0] : sym('Atom');
    });

    reg('&type-infer', (term) => {
        try {
            return sym(interpreter.typeChecker?.typeToString(interpreter.typeChecker.infer(term, {})) || 'Unknown');
        } catch {
            return sym('Error');
        }
    });

    reg('&type-check', (t, type) => sym(interpreter.typeChecker ? 'True' : 'False'));

    // Context-dependent type operations
    reg('get-type', (atom, space) => {
        const s = space || interpreter.space;
        const typePattern = exp(sym(':'), [atom, v('type')]);
        const results = match(s, typePattern, v('type'));
        return results.length ? results[0] : sym('%Undefined%');
    }, { lazy: true });

    reg('match-types', (t1, t2, thenBranch, elseBranch) => {
        // Handle %Undefined% and Atom as wildcards
        if (t1.name === '%Undefined%' || t2.name === '%Undefined%' ||
            t1.name === 'Atom' || t2.name === 'Atom') {
            return thenBranch;
        }
        const bindings = Unify.unify(t1, t2);
        return bindings !== null ? thenBranch : elseBranch;
    }, { lazy: true });

    reg('assert-type', (atom, expectedType, space) => {
        const s = space || interpreter.space;
        const actualType = interpreter.ground.execute('&get-type', atom, s);

        // No type info = pass through
        if (actualType.name === '%Undefined%') return atom;

        // Unify actual and expected types
        const bindings = Unify.unify(actualType, expectedType);
        if (bindings !== null) return atom;

        // Type mismatch - return error
        return exp(sym('Error'), [
            atom,
            exp(sym('TypeError'), [expectedType, actualType])
        ]);
    }, { lazy: true });

    // Space operations
    reg('&get-atoms', () => interpreter._listify(interpreter.space.all()));
    reg('&add-atom', (atom) => { interpreter.space.add(atom); return atom; });
    reg('&rm-atom', (atom) => { interpreter.space.remove(atom); return atom; });

    // I/O operations
    reg('&println', (...args) => {
        console.log(...args.map(a => Formatter.toHyperonString(a)));
        return sym('()');
    });

    // List operations
    const formatNum = n => sym(String(n));

    reg('&length', (list) => {
        // Count elements in a list structure
        if (list?.name === '()') return formatNum(0); // Empty list
        if (list?.operator?.name === ':' && list?.components) {
            // It's a list structure like (: head tail), flatten it and count
            const flattened = interpreter.ground._flattenExpr(list);
            return formatNum(flattened.length);
        }
        // For other expressions, count components
        return formatNum(list?.components ? list.components.length + 1 : 1); // +1 for operator, or 1 for single atom
    });

    // Control flow operations
    reg('&if', (cond, thenB, elseB) => {
        const res = interpreter._reduceDeterministic(cond);
        if (res.name === 'True') return interpreter._reduceDeterministic(thenB);
        if (res.name === 'False') return interpreter._reduceDeterministic(elseB);
        return exp('if', [res, thenB, elseB]);
    }, { lazy: true });

    reg('&let*', (binds, body) => interpreter._handleLetStar(binds, body), { lazy: true });

    // Higher-order function operations
    reg('&map-fast', (fn, list) =>
        interpreter._listify(interpreter.ground._flattenExpr(list).map(el =>
            interpreter._reduceDeterministic(exp(fn, [el]))
        )),
        { lazy: true }
    );

    reg('&filter-fast', (pred, list) => {
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
    }, { lazy: true });

    reg('&foldl-fast', (fn, init, list) =>
        interpreter.ground._flattenExpr(list).reduce((acc, el) =>
            interpreter._reduceDeterministic(exp(fn, [acc, el])),
            init
        ),
        { lazy: true }
    );

    // Higher-order function operations
    reg('reduce-atom', (list, accVar, elVar, op) => {
        const elements = interpreter.ground._flattenExpr(list);
        if (elements.length === 0) return sym('()'); // Return empty if no elements

        let result = elements[0]; // Start with first element as accumulator
        for (let i = 1; i < elements.length; i++) {
            const substOp = Unify.subst(op, { [accVar.name]: result, [elVar.name]: elements[i] });
            result = interpreter._reduceDeterministic(substOp);
        }
        return result;
    }, { lazy: true });
}