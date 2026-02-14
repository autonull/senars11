import { sym, exp } from '../Term.js';

const stateRegistry = new Map();
let stateIdCounter = 0;

const error = (msg, ...args) => exp(sym('Error'), args.length ? args : [sym(msg)]);
const getStateId = atom => atom.components?.[0]?.name;
const isStateAtom = atom => atom.operator?.name === 'State';
const validateState = atom => {
    if (!isStateAtom(atom)) return error('NotAState', atom);
    const id = getStateId(atom);
    const state = stateRegistry.get(id);
    return state ? null : error('StateNotFound', atom);
};

export function registerStateOps(registry) {
    registry.register('new-state', initialValue => {
        const id = `state-${++stateIdCounter}`;
        stateRegistry.set(id, { value: initialValue, version: 0 });
        return exp(sym('State'), [sym(id)]);
    });

    registry.register('get-state', stateAtom => {
        const err = validateState(stateAtom);
        if (err) return err;
        return stateRegistry.get(getStateId(stateAtom)).value;
    });

    registry.register('change-state!', (stateAtom, newValue) => {
        const err = validateState(stateAtom);
        if (err) return err;
        const state = stateRegistry.get(getStateId(stateAtom));
        state.value = newValue;
        state.version++;
        return newValue;
    });

    registry.register('with-transaction', (stateAtom, operation) => {
        const id = getStateId(stateAtom);
        const state = stateRegistry.get(id);
        if (!state) return error('StateNotFound', stateAtom);

        const snapshot = { ...state };
        try {
            return registry.execute(operation.operator?.name, ...operation.components);
        } catch (e) {
            stateRegistry.set(id, snapshot);
            return error('TransactionFailed', sym(e.message));
        }
    }, { lazy: true });

    registry.register('state-version', stateAtom => {
        const id = getStateId(stateAtom);
        const state = stateRegistry.get(id);
        return sym(String(state?.version ?? 0));
    });
}
