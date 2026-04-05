/**
 * IOOps.js - I/O operations
 */

import {sym} from '../Term.js';

export function registerIOOps(registry) {
    const formatArgs = args => args.map(a => a?.name ?? String(a));

    registry.register('&print', (...args) => {
        console.log(formatArgs(args).join(' '));
        return args.length === 1 ? args[0] : sym('Null');
    });
    registry.register('&println', (...args) => {
        console.log(...formatArgs(args));
        return sym('()');
    });
}