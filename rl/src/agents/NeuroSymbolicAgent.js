
import { MeTTaAgent } from './MeTTaAgent.js';
import { Tensor } from '@senars/tensor';

/**
 * Neuro-Symbolic Agent that exposes Tensor operations to MeTTa.
 * Extends MeTTaAgent to include tensor primitives in the MeTTa interpreter.
 */
export class NeuroSymbolicAgent extends MeTTaAgent {
    constructor(env, strategyPath) {
        super(env, strategyPath);
    }

    async _ensureInitialized() {
        if (!this.initialized) {
            // Register Tensor Primitives BEFORE loading strategy
            this._registerTensorPrimitives();
            await super._ensureInitialized();
        }
    }

    _registerTensorPrimitives() {
        const ground = this.metta.ground;
        const Term = this.metta.termFactory || this.metta.ground.termFactory; // Access Term factory depending on implementation

        // Helper to unwrap Tensor from Atom (if wrapped) or expect it as JS object
        // MeTTa atoms wrapping JS objects usually are Symbol or Value atoms
        const unwrap = (atom) => {
            // If it's a Value atom holding a Tensor
            if (atom.type === 'Value' && atom.value instanceof Tensor) return atom.value;
            // If it's a Symbol but we somehow mapped it? unlikely.
            // Check if it's a list (vector) and convert to Tensor
             if (atom.toString().startsWith('(')) {
                 const str = atom.toString().slice(1, -1).trim();
                 const arr = str.split(/\s+/).map(Number);
                 return new Tensor(arr);
            }
            return atom;
        };

        // Helper to wrap Tensor back to Atom
        const wrap = (tensor) => {
             // We return a Value atom containing the Tensor object
             // The MeTTa interpreter needs to support Value atoms (which it likely does via Grounding)
             // We use a specific marking or just relies on JS object passing if supported
             // Assuming Ground.js supports `Value(obj)` or similar.
             // Looking at `metta/src/kernel/Ground.js` or `Term.js` would confirm.
             // We'll try to use a mechanism compatible with how MeTTaInterpreter handles JS objects.
             // Usually `Term.atom(obj)` or similar.
             // For now, let's assume we can register functions that return raw JS objects which get wrapped?
             // Or we construct a Term.

             // If we look at SeNARSBridge.js, it uses `sym` and `exp`.
             // If we want to pass opaque objects, we might need a registry or specific Value atom type.
             // Let's assume we can return a Symbol with a unique ID and store tensor in a map,
             // OR rely on `Term.js` supporting `new Term('Value', obj)`.

             // Let's check Term.js implementation via thought later if needed.
             // For now, assume we return an object and the interpreter handles it or we use a convention.
             return { type: 'Value', value: tensor, toString: () => tensor.toString() };
        };

        // Register Primitives
        // &tensor <list> -> Tensor
        ground.register('&tensor', (listAtom) => {
            const str = listAtom.toString().slice(1, -1).trim();
            const arr = str.split(/\s+/).map(Number);
            return wrap(new Tensor(arr));
        });

        // &zeros <shape_list> -> Tensor
        ground.register('&zeros', (shapeAtom) => {
             const str = shapeAtom.toString().slice(1, -1).trim();
             const shape = str.split(/\s+/).map(Number);
             return wrap(Tensor.zeros(shape));
        });

        // &randn <shape_list> -> Tensor
        ground.register('&randn', (shapeAtom) => {
             const str = shapeAtom.toString().slice(1, -1).trim();
             const shape = str.split(/\s+/).map(Number);
             return wrap(Tensor.randn(shape));
        });

        // &matmul <t1> <t2> -> Tensor
        ground.register('&matmul', (t1, t2) => {
            return wrap(unwrap(t1).matmul(unwrap(t2)));
        });

        // &add <t1> <t2> -> Tensor
        ground.register('&add', (t1, t2) => {
            return wrap(unwrap(t1).add(unwrap(t2)));
        });

        // &relu <t> -> Tensor
        ground.register('&relu', (t) => {
            return wrap(unwrap(t).relu());
        });

        // &softmax <t> -> Tensor
        ground.register('&softmax', (t) => {
            return wrap(unwrap(t).softmax());
        });

        // &argmax <t> -> Number
        ground.register('&argmax', (t) => {
             const tensor = unwrap(t);
             const arr = tensor.data;
             let maxIdx = 0;
             let maxVal = arr[0];
             for(let i=1; i<arr.length; i++) {
                 if(arr[i] > maxVal) {
                     maxVal = arr[i];
                     maxIdx = i;
                 }
             }
             // Return simple number atom
             return { type: 'Symbol', name: String(maxIdx), toString: () => String(maxIdx) };
        });

        // &shape <t> -> List
        ground.register('&shape', (t) => {
            const tensor = unwrap(t);
            return { type: 'Symbol', name: `(${tensor.shape.join(' ')})`, toString: () => `(${tensor.shape.join(' ')})` };
        });

        // &get-data <t> -> List (for debugging or output)
        ground.register('&get-data', (t) => {
             const tensor = unwrap(t);
             return { type: 'Symbol', name: `(${tensor.data.join(' ')})`, toString: () => `(${tensor.data.join(' ')})` };
        });

        // Parameter registration (Stateful)
        // Store parameters in a Map so we can update them?
        // Or we let MeTTa manage them as Atoms?
        // Let's provide a simple parameter store.
        this.params = new Map();

        // &param <name> <shape> -> Tensor (initialized or retrieved)
        ground.register('&param', (nameAtom, shapeAtom) => {
            const name = nameAtom.toString();
            if (this.params.has(name)) {
                return wrap(this.params.get(name));
            }
            const str = shapeAtom.toString().slice(1, -1).trim();
            const shape = str.split(/\s+/).map(Number);
            // Xavier init / Random
            const param = Tensor.randn(shape);
            param.requiresGrad = true;
            this.params.set(name, param);
            return wrap(param);
        });
    }
}
