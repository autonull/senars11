/**
 * EvaluationEngine for the stream-based reasoner system
 * Provides equation solving and evaluation capabilities using FunctorRegistry
 */
import {FunctorRegistry} from './FunctorRegistry.js';
import {logError} from '@senars/core';

export class EvaluationEngine {
    constructor(context = null, termFactory = null) {
        this.context = context;
        this.termFactory = termFactory;
        this.variableBindings = new Map();
        this._functorRegistry = new FunctorRegistry();
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

        if ('value' in term) {
            return term.value;
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

        const evalComps = components.map(c => this._evaluateTerm(c, bindings));
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
            const evalArgs = components.map(c => this._evaluateTerm(c, context?.bindings || {}));
            const result = this._executeFunctor(operator, evalArgs);

            if (result !== null) {
                return {result, success: true, message: 'Operation completed'};
            }

            return {result: null, success: false, message: `Unsupported: ${operator}`};

        } catch (error) {
            logError(error, {operation: operationTerm?.operator}, 'error');
            return {result: null, success: false, message: `Error: ${error.message}`};
        }
    }

    reset() {
        this.variableBindings.clear();
        this._functorRegistry.clear();
    }

    getFunctorRegistry() {
        return this._functorRegistry;
    }

    getState() {
        return {
            functorRegistryStats: this._functorRegistry.getStats(),
            bindingsCount: this.variableBindings.size
        };
    }
}
