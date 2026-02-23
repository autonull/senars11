/**
 * ReflectionOps.js - Reflection operations for JS interoperability
 */

import { sym, grounded, isGrounded } from '../../kernel/Term.js';
import { OperationHelpers } from './OperationHelpers.js';

export function registerReflectionOps(registry) {
    const unwrap = (atom) => {
        if (isGrounded(atom)) return atom.value;
        if (atom?.type === 'atom') {
            const n = OperationHelpers.atomToNum(atom);
            if (n !== null) return n;
            if (atom.name === 'True') return true;
            if (atom.name === 'False') return false;
            if (atom.name === 'Null') return null;
            if (atom.name === 'undefined') return undefined;
            return atom.name;
        }
        return atom;
    };

    registry.register('&js-import', async (path) => {
        const mod = await import(unwrap(path));
        return grounded(mod);
    });

    registry.register('&js-new', (cls, ...args) => {
        const Constructor = unwrap(cls);
        const jsArgs = args.map(unwrap);
        if (typeof Constructor !== 'function') {
            throw new Error(`&js-new: Class constructor not found or not a function: ${cls}`);
        }
        return grounded(new Constructor(...jsArgs));
    });

    registry.register('&js-call', (obj, method, ...args) => {
        const target = unwrap(obj);
        const methodName = unwrap(method);

        if (!target) throw new Error(`&js-call: Target object is null/undefined`);

        let fn = target[methodName];

        // Handle nested paths like "foo.bar" if method is a string
        if (!fn && typeof methodName === 'string' && methodName.includes('.')) {
            const parts = methodName.split('.');
            let ctx = target;
            let current = target;
            for (const p of parts) {
                ctx = current;
                current = current?.[p];
            }
            fn = current;
            if (typeof fn === 'function') {
                const jsArgs = args.map(unwrap);
                const result = fn.apply(ctx, jsArgs);
                return grounded(result);
            }
        }

        if (typeof fn !== 'function') {
             throw new Error(`&js-call: Method '${methodName}' not found or not a function on ${target}`);
        }

        const jsArgs = args.map(unwrap);
        const result = fn.apply(target, jsArgs);
        return grounded(result);
    });

    registry.register('&js-get', (obj, prop) => {
        const target = unwrap(obj);
        const p = unwrap(prop);
        if (!target) throw new Error(`&js-get: Target object is null/undefined`);
        const val = target[p];
        return grounded(val);
    });

    registry.register('&js-set', (obj, prop, val) => {
        const target = unwrap(obj);
        const p = unwrap(prop);
        if (!target) throw new Error(`&js-set: Target object is null/undefined`);
        target[p] = unwrap(val);
        return grounded(target);
    });

    registry.register('&js-type', (obj) => {
        const val = unwrap(obj);
        return sym(typeof val);
    });

    registry.register('&js-unwrap', (obj) => {
        const val = unwrap(obj);
        // If it's a primitive that can be a symbol, return symbol?
        // But the user might want the raw value.
        // MeTTa mostly works with atoms.
        // If it's a number, return atom number?
        if (typeof val === 'number') return sym(String(val));
        if (typeof val === 'boolean') return sym(val ? 'True' : 'False');
        if (typeof val === 'string') return sym(val);
        return obj; // Return original grounded atom if it can't be unwrapped to simple atom
    });
}
