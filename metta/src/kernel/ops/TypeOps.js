/**
 * TypeOps.js - Type operations
 */

import {isExpression, sym} from '../Term.js';
import {OperationHelpers} from './OperationHelpers.js';

export function registerTypeOps(registry) {
    // Get metatype of an atom
    registry.register('&get-metatype', (atom) => {
        if (!atom) {
            return sym('%Undefined%');
        }
        if (atom.name?.startsWith('$')) {
            return sym('Variable');
        }
        if (isExpression(atom)) {
            return sym('Expression');
        }
        if (typeof atom.execute === 'function') {
            return sym('Grounded');
        }
        return sym('Symbol');
    }, {lazy: true}); // Prevent reduction to check actual metatype

    // Check if type is a function type (has -> arrow)
    registry.register('&is-function', (type) => {
        if (!isExpression(type)) {
            return sym('False');
        }
        return OperationHelpers.bool(type.operator?.name === '->');
    });

    // Existing type operations
    registry.register('&type-infer', (t, i) => i?.typeChecker ? sym(i.typeChecker.typeToString(i.typeChecker.infer(t, {}))) : sym('Unknown'));
    registry.register('&type-check', (t, e, i) => OperationHelpers.bool(i?.typeChecker?.check(t, e, {})));
    registry.register('&type-unify', (t1, t2, i) => sym(i?.typeChecker?.unify(t1, t2) ? 'Success' : 'Failure'));
}