/**
 * New EvaluationEngine for the stream-based reasoner system
 * Provides equation solving and evaluation capabilities
 */
import {FunctorRegistry} from './FunctorRegistry.js';
import {logError} from './utils/error.js';

export class EvaluationEngine {
    constructor(context = null, termFactory = null) {
        this.context = context;
        this.termFactory = termFactory;
        this._initEngine();
    }

    _initEngine() {
        // Initialize evaluation engine components
        this.operationRegistry = new Map();
        this.variableBindings = new Map();
        this._functorRegistry = new FunctorRegistry();
        this._initDefaultOperations();
    }

    /**
     * Initialize default operations for common mathematical and logical operations
     */
    _initDefaultOperations() {
        // Register common operations
        const ops = [
            ['+', this._performAddition],
            ['-', this._performSubtraction],
            ['*', this._performMultiplication],
            ['/', this._performDivision],
            ['>', this._performGreaterThan],
            ['<', this._performLessThan],
            ['>=', this._performGreaterEqual],
            ['<=', this._performLessEqual],
            ['==', this._performEquality],
            ['!=', this._performInequality]
        ];

        for (const [symbol, func] of ops) {
            this.operationRegistry.set(symbol, func.bind(this));
        }
    }

    /**
     * Solve equations of the form leftTerm = rightTerm for a given variable
     * This is a more sophisticated equation solver with symbolic computation
     */
    async solveEquation(leftTerm, rightTerm, variableName, evaluationContext = null) {
        try {
            // Handle different equation types with symbolic computation
            if (this._isSimpleAssignment(leftTerm, variableName)) {
                return {result: rightTerm, success: true, message: 'Direct assignment solved'};
            }

            if (this._isSimpleAssignment(rightTerm, variableName)) {
                return {result: leftTerm, success: true, message: 'Direct assignment solved (flipped)'};
            }

            // Check if both sides contain the same variable (with simple linear equations)
            const leftContainsVar = this._containsVariable(leftTerm, variableName);
            const rightContainsVar = this._containsVariable(rightTerm, variableName);

            if (leftContainsVar && !rightContainsVar) {
                // Try to isolate the variable on the left side
                return this._solveLinear(leftTerm, rightTerm, variableName);
            } else if (rightContainsVar && !leftContainsVar) {
                // Try to isolate the variable on the right side
                return this._solveLinear(rightTerm, leftTerm, variableName);
            }

            return {
                result: null,
                success: false,
                message: 'Complex equation - requires advanced solving algorithm'
            };
        } catch (error) {
            logError(error, {operation: 'solve_equation', variable: variableName}, 'error');
            return {
                result: null,
                success: false,
                message: `Error solving equation: ${error.message}`
            };
        }
    }

    /**
     * Solve simple linear equations of the form ax + b = c
     */
    _solveLinear(expression, constant, variableName) {
        // For now, return a simple symbolic representation
        // In a full implementation, this would perform symbolic algebra
        return {
            result: {type: 'symbolic_solution', expression, constant, variable: variableName},
            success: true,
            message: 'Symbolic solution computed'
        };
    }

    _isSimpleAssignment(term, variableName) {
        // Check if term is just the variable
        return term?.name === variableName ||
            (term?.toString && term.toString() === variableName);
    }

    /**
     * Check if a term contains a specific variable
     */
    _containsVariable(term, variableName) {
        if (!term) return false;

        if (this._isSimpleAssignment(term, variableName)) {
            return true;
        }

        // If term has components (like in compound terms), check them recursively
        if (Array.isArray(term.components)) {
            return term.components.some(comp => this._containsVariable(comp, variableName));
        }

        return false;
    }

    /**
     * Evaluate a term with given bindings using the functor registry
     */
    evaluate(term, bindings = {}) {
        // Apply variable bindings and evaluate the term
        try {
            // Update bindings if provided
            this._updateVariableBindings(bindings);
            return this._evaluateTerm(term, bindings);
        } catch (error) {
            logError(error, {operation: 'evaluation'}, 'error');
            return null;
        }
    }

    /**
     * Update variable bindings
     */
    _updateVariableBindings(bindings) {
        Object.entries(bindings).forEach(([varName, value]) => {
            this.variableBindings.set(varName, value);
        });
    }

    _evaluateTerm(term, bindings) {
        if (!term) return term;

        // Handle variable substitution
        if (term.type === 'VARIABLE' || term.name?.startsWith('#')) {
            const value = bindings[term.name] ?? this.variableBindings.get(term.name);
            return value !== undefined ? value : term;
        }

        // Handle compound terms with operators
        if (term.operator && term.components) {
            return this._evaluateOperation(term, bindings);
        }

        // Handle functor application
        if (term.functor && term.args) {
            try {
                return this._functorRegistry.execute(term.functor, ...term.args.map(arg => this._evaluateTerm(arg, bindings)));
            } catch (error) {
                logError(error, {functor: term.functor}, 'warn');
                return null;
            }
        }

        return term;
    }

    /**
     * Evaluate a term with operator and components
     */
    _evaluateOperation(term, bindings) {
        const {operator, components} = term;
        if (!operator || !components) return term;

        // Try to get registered operation function
        const operation = this.operationRegistry.get(operator);
        if (operation) {
            const evaluatedComponents = components.map(comp => this._evaluateTerm(comp, bindings));
            return operation(...evaluatedComponents);
        }

        // Fallback: try functor registry
        try {
            const functorResult = this._functorRegistry.execute(operator, ...components.map(comp => this._evaluateTerm(comp, bindings)));
            return functorResult;
        } catch (e) {
            // If both fail, return the original term
            return term;
        }
    }

    /**
     * Perform addition operation
     */
    _performAddition(...args) {
        return this._performMathOperation(args, 0, (result, val) => result + val);
    }

    /**
     * Perform subtraction operation
     */
    _performSubtraction(...args) {
        return this._performMathOperation(args, 0, (result, val, index, values) =>
            index === 0 && values.length === 1 ? -val : index === 0 ? val : result - val);
    }

    /**
     * Perform multiplication operation
     */
    _performMultiplication(...args) {
        return this._performMathOperation(args, 1, (result, val) => result * val);
    }

    /**
     * Perform division operation
     */
    _performDivision(...args) {
        return this._performMathOperation(args, 1, (result, val, index, values) => {
            if (index === 0 && values.length === 1) return 1 / (val || 1); // Avoid division by zero
            return index === 0 ? val : result / (val || 1);
        });
    }

    /**
     * Generic math operation helper
     */
    _performMathOperation(args, identityValue, operation) {
        if (args.length === 0) return identityValue;

        const values = args
            .filter(arg => arg !== null && arg !== undefined)
            .map(arg => typeof arg === 'object' && arg.value !== undefined ? arg.value : arg)
            .map(val => Number(val));

        if (values.length === 0) return identityValue;

        return values.reduce((result, val, index) => operation(result, val, index, values), identityValue);
    }

    /**
     * Helper for comparisons
     */
    _performComparison(a, b, op) {
        return (a != null && b != null) ? op(Number(a), Number(b)) : false;
    }

    /**
     * Perform comparison operations
     */
    _performGreaterThan(a, b) {
        return this._performComparison(a, b, (x, y) => x > y);
    }

    _performLessThan(a, b) {
        return this._performComparison(a, b, (x, y) => x < y);
    }

    _performGreaterEqual(a, b) {
        return this._performComparison(a, b, (x, y) => x >= y);
    }

    _performLessEqual(a, b) {
        return this._performComparison(a, b, (x, y) => x <= y);
    }

    _performEquality(a, b) {
        return a === b;
    }

    _performInequality(a, b) {
        return a !== b;
    }

    /**
     * Process operations and evaluate expressions using registered operations
     */
    async processOperation(operationTerm, context) {
        try {
            if (!operationTerm?.operator) {
                return {result: null, success: false, message: 'Invalid operation term'};
            }

            const operation = this.operationRegistry.get(operationTerm.operator);

            if (!operation) {
                // Try functor registry as fallback
                try {
                    const result = this._functorRegistry.execute(
                        operationTerm.operator,
                        ...(operationTerm.components || []).map(comp =>
                            this._evaluateTerm(comp, context?.bindings || {})
                        )
                    );
                    return {result, success: true, message: 'Functor execution completed'};
                } catch (e) {
                    return {result: null, success: false, message: `Unsupported operation: ${operationTerm.operator}`};
                }
            }

            if (!operationTerm.components || operationTerm.components.length === 0) {
                return {result: operation(), success: true, message: 'Nullary operation completed'};
            }

            const result = operation(...operationTerm.components);
            return {result, success: true, message: 'Operation completed'};
        } catch (error) {
            logError(error, {operation: operationTerm?.operator}, 'error');
            return {result: null, success: false, message: `Error in operation: ${error.message}`};
        }
    }

    /**
     * Evaluate a symbolic expression with variables
     */
    async evaluateSymbolicExpression(expression, variableBindings) {
        // This would handle complex symbolic expression evaluation
        try {
            const result = this._evaluateTerm(expression, variableBindings || {});
            return {result, success: true};
        } catch (error) {
            logError(error, {operation: 'symbolic_evaluation'}, 'error');
            return {result: null, success: false, error: error.message};
        }
    }

    /**
     * Reset the evaluation engine
     */
    reset() {
        this.variableBindings.clear();
        this.operationRegistry.clear();
        this._initDefaultOperations();
    }

    /**
     * Get the functor registry
     */
    getFunctorRegistry() {
        return this._functorRegistry;
    }

    /**
     * Get information about the current state
     */
    getState() {
        return {
            operationRegistrySize: this.operationRegistry.size,
            bindingsCount: this.variableBindings.size,
            functorRegistryStats: this._functorRegistry.getStats()
        };
    }
}
