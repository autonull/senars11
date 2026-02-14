
import { Term } from './kernel/Term.js';

export function objToBindingsAtom(bindings) {
    const pairs = [];
    for (const [key, value] of Object.entries(bindings)) {
        pairs.push(Term.exp('Pair', [Term.var(key), value]));
    }
    // Return (Bindings (Pair $x val) ...)
    // If empty, (Bindings)
    return Term.exp('Bindings', pairs);
}

export function bindingsAtomToObj(bindingsAtom) {
    const bindings = {};
    if (bindingsAtom.operator && bindingsAtom.operator.name === 'Bindings') {
        for (const pair of bindingsAtom.components) {
            if (pair.operator && pair.operator.name === 'Pair' && pair.components.length === 2) {
                const variable = pair.components[0];
                const value = pair.components[1];
                if (variable.name) {
                    bindings[variable.name] = value;
                }
            }
        }
    }
    return bindings;
}
