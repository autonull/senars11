/**
 * New EvaluationEngine for the stream-based reasoner system
 * Provides equation solving and evaluation capabilities
 */
import {FunctorRegistry} from './FunctorRegistry.js';
import {logError} from '@senars/core';
import {OperationRegistry} from './OperationRegistry.js';

export class EvaluationEngine {
    constructor(context = null, termFactory = null) {
        this.context = context;
        this.termFactory = termFactory;
        this.operationRegistry = new OperationRegistry();
        this.variableBindings = new Map();
        this._functorRegistry = new FunctorRegistry();
        this._initDefaultOperations();
    }

    _initDefaultOperations() {
        const ops = [
            ['+', (a, b) => this._op(a, b, (x, y) => x + y, 0), {arity: 2, category: 'arithmetic', identity: 0}],
            ['-', (a, b) => this._op(a, b, (x, y) => x - y, 0, true), {arity: 2, category: 'arithmetic', identity: 0}],
            ['*', (a, b) => this._op(a, b, (x, y) => x * y, 1), {arity: 2, category: 'arithmetic', identity: 1}],
            ['/', (a, b) => this._op(a, b, (x, y) => x / (y || 1), 1, true), {
                arity: 2,
                category: 'arithmetic',
                identity: 1
            }],
            ['>', (a, b) => this._cmp(a, b, (x, y) => x > y), {arity: 2, category: 'comparison'}],
            ['<', (a, b) => this._cmp(a, b, (x, y) => x < y), {arity: 2, category: 'comparison'}],
            ['>=', (a, b) => this._cmp(a, b, (x, y) => x >= y), {arity: 2, category: 'comparison'}],
            ['<=', (a, b) => this._cmp(a, b, (x, y) => x <= y), {arity: 2, category: 'comparison'}],
            ['==', (a, b) => a === b, {arity: 2, category: 'logical'}],
            ['!=', (a, b) => a !== b, {arity: 2, category: 'logical'}]
        ];

        this.operationRegistry.registerAll(ops);
    }

    _op(a, b, fn, identity, strictOrder = false) {
        // If arguments are passed individually, wrap them
        const args = (b === undefined) ? (Array.isArray(a) ? a : [a]) : [a, b];

        const values = args
            .filter(v => v != null)
            .map(v => typeof v === 'object' && v.value !== undefined ? v.value : v)
            .map(Number);

        if (!values.length) {
            return identity;
        }
        if (values.length === 1 && strictOrder) {
            return fn(identity, values[0]);
        }

        return values.reduce((acc, val, i) => i === 0 ? val : fn(acc, val), strictOrder ? values[0] : identity);
    }

    _cmp(a, b, fn) {
        // Comparison expects two arguments typically, but if arrays passed, take first two
        const args = (b === undefined && Array.isArray(a)) ? a : [a, b];
        const v1 = args[0] && typeof args[0] === 'object' && args[0].value !== undefined ? args[0].value : args[0];
        const v2 = args[1] && typeof args[1] === 'object' && args[1].value !== undefined ? args[1].value : args[1];

        return (v1 != null && v2 != null) ? fn(Number(v1), Number(v2)) : false;
    }

    async solveEquation(leftTerm, rightTerm, variableName, evaluationContext = null) {
        try {
            if (this._isSimpleAssignment(leftTerm, variableName)) {
                return {result: rightTerm, success: true, message: 'Direct assignment solved'};
            }
            if (this._isSimpleAssignment(rightTerm, variableName)) {
                return {result: leftTerm, success: true, message: 'Direct assignment solved (flipped)'};
            }

            const leftHasVar = this._containsVariable(leftTerm, variableName);
            const rightHasVar = this._containsVariable(rightTerm, variableName);

            if (leftHasVar !== rightHasVar) {
                const expression = leftHasVar ? leftTerm : rightTerm;
                const constant = leftHasVar ? rightTerm : leftTerm;
                return this._solveLinear(expression, constant, variableName);
            }

            return {result: null, success: false, message: 'Complex equation'};
        } catch (error) {
            logError(error, {operation: 'solve_equation', variable: variableName}, 'error');
            return {result: null, success: false, message: `Error: ${error.message}`};
        }
    }

    _solveLinear(expression, constant, variableName) {
        return {
            result: {type: 'symbolic_solution', expression, constant, variable: variableName},
            success: true,
            message: 'Symbolic solution computed'
        };
    }

    _isSimpleAssignment(term, variableName) {
        return term?.name === variableName || (term?.toString && term.toString() === variableName);
    }

    _containsVariable(term, variableName) {
        if (!term) {
            return false;
        }
        if (this._isSimpleAssignment(term, variableName)) {
            return true;
        }
        return Array.isArray(term.components) && term.components.some(c => this._containsVariable(c, variableName));
    }

    evaluate(term, bindings = {}) {
        try {
            this._updateVariableBindings(bindings);
            return this._evaluateTerm(term, bindings);
        } catch (error) {
            logError(error, {operation: 'evaluation'}, 'error');
            return null;
        }
    }

    _updateVariableBindings(bindings) {
        Object.entries(bindings).forEach(([k, v]) => this.variableBindings.set(k, v));
    }

    _evaluateTerm(term, bindings) {
        if (!term) {
            return term;
        }

        if (term.type === 'VARIABLE' || term.name?.startsWith('#')) {
            return bindings[term.name] ?? this.variableBindings.get(term.name) ?? term;
        }

        if (term.operator && term.components) {
            return this._evaluateOperation(term, bindings);
        }

        if (term.functor && term.args) {
            return this._executeFunctor(term.functor, term.args.map(a => this._evaluateTerm(a, bindings)));
        }

        return term;
    }

    _evaluateOperation(term, bindings) {
        const {operator, components} = term;
        if (!operator || !components) {
            return term;
        }

        const opFunc = this.operationRegistry.get(operator);
        const evalComps = components.map(c => this._evaluateTerm(c, bindings));

        // Pass array of components to opFunc
        if (opFunc) {
            return opFunc(evalComps);
        }

        return this._executeFunctor(operator, evalComps) ?? term;
    }

    _executeFunctor(name, args) {
        try {
            return this._functorRegistry.execute(name, ...args);
        } catch (error) {
            return null;
        }
    }

    async processOperation(operationTerm, context) {
        try {
            if (!operationTerm?.operator) {
                return {result: null, success: false, message: 'Invalid operation'};
            }

            const {operator, components = []} = operationTerm;
            const opFunc = this.operationRegistry.get(operator);

            if (opFunc) {
                // Pass array of components to opFunc
                const result = opFunc(components);
                return {result, success: true, message: 'Operation completed'};
            }

            // Fallback to functor
            const evalArgs = components.map(c => this._evaluateTerm(c, context?.bindings || {}));
            const result = this._executeFunctor(operator, evalArgs);

            if (result !== null) {
                return {result, success: true, message: 'Functor executed'};
            }

            return {result: null, success: false, message: `Unsupported: ${operator}`};

        } catch (error) {
            logError(error, {operation: operationTerm?.operator}, 'error');
            return {result: null, success: false, message: `Error: ${error.message}`};
        }
    }

    reset() {
        this.variableBindings.clear();
        this.operationRegistry.clear();
        this._initDefaultOperations();
    }

    getFunctorRegistry() {
        return this._functorRegistry;
    }

    getState() {
        return {
            operationRegistrySize: this.operationRegistry.size,
            bindingsCount: this.variableBindings.size,
            functorRegistryStats: this._functorRegistry.getStats()
        };
    }
}
