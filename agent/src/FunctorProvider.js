const ARITHMETIC_FUNCTORS = [
    {name: 'add', fn: (a, b) => a + b, commutative: true, associative: true, desc: 'Addition'},
    {name: 'subtract', fn: (a, b) => a - b, commutative: false, associative: false, desc: 'Subtraction'},
    {name: 'multiply', fn: (a, b) => a * b, commutative: true, associative: true, desc: 'Multiplication'},
    {
        name: 'divide',
        fn: (a, b) => b !== 0 ? a / b : null,
        commutative: false,
        associative: false,
        desc: 'Division'
    }
];

const SET_OPERATION_FUNCTORS = [
    {
        name: 'union',
        fn: (a, b) => Array.isArray(a) && Array.isArray(b) ? [...new Set([...a, ...b])] : null,
        commutative: true,
        desc: 'Set union'
    },
    {
        name: 'intersection',
        fn: (a, b) => Array.isArray(a) && Array.isArray(b) ? a.filter(x => b.includes(x)) : null,
        commutative: true,
        desc: 'Set intersection'
    }
];

const FUNCTOR_COLLECTIONS = {
    'core-arithmetic': ARITHMETIC_FUNCTORS,
    'set-operations': SET_OPERATION_FUNCTORS,
};

export class FunctorProvider {
    static registerFunctors(registry, functorConfig) {
        if (!registry) return;

        const collectionsToRegister = Array.isArray(functorConfig)
            ? functorConfig
            : Object.entries(functorConfig)
                .filter(([, enabled]) => enabled)
                .map(([collectionName]) => collectionName);

        for (const collectionName of collectionsToRegister) {
            const collection = FUNCTOR_COLLECTIONS[collectionName];
            if (collection) {
                this.registerFunctorCollection(registry, collection);
            }
        }
    }

    static registerFunctorCollection(registry, collection) {
        for (const op of collection) {
            if (!registry.has(op.name)) {
                registry.registerFunctorDynamic(op.name, op.fn, {
                    arity: 2,
                    isCommutative: op.commutative,
                    isAssociative: op.associative,
                    description: op.desc
                });
            }
        }
    }
}
