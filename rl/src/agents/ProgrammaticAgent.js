
import { MeTTaAgent } from './MeTTaAgent.js';
import { Tensor } from '@senars/tensor';

export class ProgrammaticAgent extends MeTTaAgent {
    constructor(env, strategyPath) {
        super(env, strategyPath);
        this.params = new Map();
    }

    async _ensureInitialized() {
        if (!this.initialized) {
            this._registerTensorPrimitives();
            await super._ensureInitialized();
        }
    }

    _registerTensorPrimitives() {
        const ground = this.metta.ground;
        const reg = (name, fn) => ground.register(name, fn);

        const unwrap = (atom) => {
            if (atom.type === 'Value' && atom.value instanceof Tensor) return atom.value;
            if (atom.toString().startsWith('(')) {
                return new Tensor(atom.toString().slice(1, -1).trim().split(/\s+/).map(Number));
            }
            return atom;
        };

        const wrap = (t) => ({ type: 'Value', value: t, toString: () => t.toString() });

        reg('&tensor', list => wrap(new Tensor(list.toString().slice(1, -1).trim().split(/\s+/).map(Number))));
        reg('&zeros', shape => wrap(Tensor.zeros(shape.toString().slice(1, -1).trim().split(/\s+/).map(Number))));
        reg('&randn', shape => wrap(Tensor.randn(shape.toString().slice(1, -1).trim().split(/\s+/).map(Number))));

        reg('&matmul', (t1, t2) => wrap(unwrap(t1).matmul(unwrap(t2))));
        reg('&add', (t1, t2) => wrap(unwrap(t1).add(unwrap(t2))));
        reg('&relu', t => wrap(unwrap(t).relu()));
        reg('&softmax', t => wrap(unwrap(t).softmax()));

        reg('&argmax', t => {
            const arr = unwrap(t).data;
            let maxIdx = 0, maxVal = arr[0];
            for (let i = 1; i < arr.length; i++) {
                if (arr[i] > maxVal) { maxVal = arr[i]; maxIdx = i; }
            }
            return { type: 'Symbol', name: String(maxIdx), toString: () => String(maxIdx) };
        });

        reg('&shape', t => {
            const s = unwrap(t).shape.join(' ');
            return { type: 'Symbol', name: `(${s})`, toString: () => `(${s})` };
        });

        reg('&get-data', t => {
            const d = unwrap(t).data.join(' ');
            return { type: 'Symbol', name: `(${d})`, toString: () => `(${d})` };
        });

        reg('&param', (nameAtom, shapeAtom) => {
            const name = nameAtom.toString();
            if (this.params.has(name)) return wrap(this.params.get(name));

            const shape = shapeAtom.toString().slice(1, -1).trim().split(/\s+/).map(Number);
            const param = Tensor.randn(shape);
            param.requiresGrad = true;
            this.params.set(name, param);
            return wrap(param);
        });
    }
}
