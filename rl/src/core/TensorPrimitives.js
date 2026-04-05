import { Tensor, TensorFunctor } from '@senars/tensor';
import { PolicyUtils } from '../utils/PolicyUtils.js';

const TensorWrapper = {
    wrap(t) {
        return {
            type: 'Value',
            value: t,
            toString: () => t.toString(),
            equals: (other) => other?.type === 'Value' && other.value instanceof Tensor &&
                t.shape.toString() === other.value.shape.toString() &&
                t.data.every((v, i) => Math.abs(v - other.value.data[i]) < 1e-6)
        };
    },

    unwrap(atom) {
        if (!atom) {return null;}
        if (atom.type === 'Value' && atom.value instanceof Tensor) {return atom.value;}
        if (atom.type === 'Symbol') {
            const {name} = atom;
            if (name.startsWith('(')) {
                try {
                    return new Tensor(name.slice(1, -1).trim().split(/\s+/).map(Number));
                } catch { /* Fail silently */ }
            }
            const num = Number(name);
            if (!isNaN(num)) {return num;}
        }
        return atom;
    },

    createOp(name, functor) {
        return (...args) => {
            const unwrappedArgs = args.map(a => TensorWrapper.unwrap(a));
            const term = { operator: name, components: unwrappedArgs };
            return TensorWrapper.wrap(functor.evaluate(term, new Map()));
        };
    },

    parseShape(shapeAtom) {
        return shapeAtom.toString().slice(1, -1).trim().split(/\s+/).map(Number);
    },

    createSymbol(name) {
        return { type: 'Symbol', name, toString: () => name };
    }
};

export function registerTensorPrimitives(metta) {
    const functor = new TensorFunctor();
    const {ground} = metta;
    const reg = (name, fn) => ground.register(name, fn);

    const { wrap, unwrap, createOp, parseShape, createSymbol } = TensorWrapper;

    const ops = [
        'matmul', 'add', 'sub', 'mul', 'div',
        'relu', 'sigmoid', 'tanh', 'softmax',
        'sum', 'mean', 'max', 'min',
        'exp', 'log', 'pow',
        'reshape', 'transpose',
        'truth_to_tensor', 'tensor_to_truth',
        'mse', 'mae', 'binary_cross_entropy', 'cross_entropy',
        'sgd_step', 'adam_step',
        'grad', 'backward', 'zero_grad'
    ];

    for (const name of ops) {
        reg(`&${name}`, createOp(name, functor));
    }

    reg('&tensor', list => wrap(new Tensor(parseShape(list))));
    reg('&zeros', shape => wrap(Tensor.zeros(parseShape(shape))));
    reg('&randn', shape => wrap(Tensor.randn(parseShape(shape))));

    const params = new Map();
    reg('&param', (nameAtom, shapeAtom) => {
        const name = nameAtom.toString();
        if (params.has(name)) {return wrap(params.get(name));}

        const param = Tensor.randn(parseShape(shapeAtom));
        param.requiresGrad = true;
        params.set(name, param);
        return wrap(param);
    });

    reg('&shape', t => createSymbol(`(${unwrap(t).shape.join(' ')})`));
    reg('&get-data', t => createSymbol(`(${unwrap(t).data.join(' ')})`));

    reg('&argmax', t => {
        const arr = unwrap(t).data;
        const maxIdx = PolicyUtils.argmax(arr);
        return createSymbol(String(maxIdx));
    });
}
