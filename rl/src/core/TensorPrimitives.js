
import { Tensor, TensorFunctor } from '@senars/tensor';

/**
 * Helper function to register TensorFunctor operations into a MeTTa interpreter.
 *
 * @param {MeTTaInterpreter} metta
 */
export function registerTensorPrimitives(metta) {
    const functor = new TensorFunctor();
    const ground = metta.ground;
    const reg = (name, fn) => ground.register(name, fn);

    const wrap = (t) => ({
        type: 'Value',
        value: t,
        toString: () => t.toString(),
        equals: (other) => other?.type === 'Value' && other.value instanceof Tensor &&
                           t.shape.toString() === other.value.shape.toString() &&
                           t.data.every((v, i) => Math.abs(v - other.value.data[i]) < 1e-6)
    });

    const unwrap = (atom) => {
        if (atom.type === 'Value' && atom.value instanceof Tensor) return atom.value;
        if (atom.type === 'Symbol' && atom.name.startsWith('(')) {
            // Attempt to parse list string as tensor
            try {
                return new Tensor(atom.name.slice(1, -1).trim().split(/\s+/).map(Number));
            } catch (e) {
                // Fallback
            }
        }
        if (atom.type === 'Symbol' && !isNaN(Number(atom.name))) return Number(atom.name);
        return atom;
    };

    // Generic operation wrapper
    const op = (name, arity) => {
        return (...args) => {
            const unwrappedArgs = args.map(unwrap);
            // Construct a dummy term for TensorFunctor.evaluate to dispatch
            const term = {
                operator: name,
                components: unwrappedArgs
            };

            // However, TensorFunctor.evaluate expects atoms or resolved values.
            // It's easier to call the backend ops directly if mapped, or use evaluate logic.

            // Let's use the functor's dispatch logic by mimicking the evaluate flow
            // But since we are inside a primitive, we can just look up the op in functor.ops or call backend

            // Best approach: Use functor.evaluate with a constructed term
            // We need a dummy bindings object
            const result = functor.evaluate(term, new Map());
            return wrap(result);
        };
    };

    // Register all standard ops
    const ops = [
        'matmul', 'add', 'sub', 'mul', 'div',
        'relu', 'sigmoid', 'tanh', 'softmax',
        'sum', 'mean', 'max', 'min',
        'exp', 'log', 'pow',
        'reshape', 'transpose',
        'mse', 'mae', 'binary_cross_entropy', 'cross_entropy',
        'sgd_step', 'adam_step',
        'grad', 'backward', 'zero_grad'
    ];

    ops.forEach(name => {
        reg(`&${name}`, op(name));
    });

    // Special constructors
    reg('&tensor', list => wrap(new Tensor(list.toString().slice(1, -1).trim().split(/\s+/).map(Number))));
    reg('&zeros', shape => wrap(Tensor.zeros(shape.toString().slice(1, -1).trim().split(/\s+/).map(Number))));
    reg('&randn', shape => wrap(Tensor.randn(shape.toString().slice(1, -1).trim().split(/\s+/).map(Number))));

    // Parameter creation (stateful)
    const params = new Map();
    reg('&param', (nameAtom, shapeAtom) => {
        const name = nameAtom.toString();
        if (params.has(name)) return wrap(params.get(name));

        const shape = shapeAtom.toString().slice(1, -1).trim().split(/\s+/).map(Number);
        const param = Tensor.randn(shape);
        param.requiresGrad = true;
        params.set(name, param);
        return wrap(param);
    });

    // Accessors
    reg('&shape', t => {
        const s = unwrap(t).shape.join(' ');
        return { type: 'Symbol', name: `(${s})`, toString: () => `(${s})` };
    });

    reg('&get-data', t => {
        const d = unwrap(t).data.join(' ');
        return { type: 'Symbol', name: `(${d})`, toString: () => `(${d})` };
    });

    reg('&argmax', t => {
        const arr = unwrap(t).data;
        let maxIdx = 0, maxVal = arr[0];
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] > maxVal) { maxVal = arr[i]; maxIdx = i; }
        }
        return { type: 'Symbol', name: String(maxIdx), toString: () => String(maxIdx) };
    });
}
