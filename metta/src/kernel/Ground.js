/**
 * Ground.js - Native function registry
 * Registry for grounded operations in MeTTa
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized, Deeply deduplicated
 */

import { sym, exp, isExpression, constructList, isList, flattenList } from './Term.js';
import { Unify } from './Unify.js';
import { OperationHelpers } from './ops/OperationHelpers.js';
import { CoreRegistry } from './ops/CoreRegistry.js';
import { registerArithmeticOps } from './ops/ArithmeticOps.js';
import { registerComparisonOps } from './ops/ComparisonOps.js';
import { registerLogicalOps } from './ops/LogicalOps.js';
import { registerListOps } from './ops/ListOps.js';
import { registerStringOps } from './ops/StringOps.js';
import { registerIOOps } from './ops/IOOps.js';
import { registerSpaceOps } from './ops/SpaceOps.js';
import { registerStateOps } from './ops/StateOps.js';
import { registerIntrospectionOps } from './ops/IntrospectionOps.js';
import { registerTypeOps } from './ops/TypeOps.js';
import { registerBudgetOps } from './ops/BudgetOps.js';
import { registerExpressionOps } from './ops/ExpressionOps.js';
import { registerMathOps } from './ops/MathOps.js';
import { registerSetOps } from './ops/SetOps.js';
import { registerHOFOps } from './ops/HOFOps.js';
import { registerMetaprogrammingOps } from './ops/MetaprogrammingOps.js';

export class Ground extends CoreRegistry {
    constructor(context = {}) {
        super();
        this.context = context;
        this._registerCoreOperations();
    }

    // === Implementation Helpers ===

    /**
     * Convert an atom to a number
     */
    _atomToNum(atom) { return OperationHelpers.atomToNum(atom); }

    /**
     * Require numeric arguments
     */
    _requireNums(args, count = null) { return OperationHelpers.requireNums(args, count); }

    /**
     * Convert a boolean value to a symbolic representation
     */
    _bool(val) { return OperationHelpers.bool(val); }

    /**
     * Determine the truthiness of a value
     */
    _truthy(val) { return OperationHelpers.truthy(val); }

    /**
     * Flatten an expression to an array of its components
     */
    _flattenExpr(expr) { return OperationHelpers.flattenExpr(expr); }

    /**
     * Convert an array to a list representation
     */
    _listify(arr) { return OperationHelpers.listify(arr); }

    /**
     * Check if an atom represents a list
     */
    _isList(atom) { return OperationHelpers.isList(atom); }

    // === Registration ===

    /**
     * Register all core operations
     */
    _registerCoreOperations() {
        // Register core operation categories
        this._registerBasicOps();
        this._registerAdvancedOps();

        // Register utility operations
        this.register('&now', () => sym(String(Date.now())));

        // Register placeholder operations
        this._registerPlaceholders();

        // Register metaprogramming operations (require interpreter context)
        registerMetaprogrammingOps(this);
    }

    /**
     * Register basic operations
     */
    _registerBasicOps() {
        registerArithmeticOps(this);
        registerComparisonOps(this);
        registerLogicalOps(this);
        registerListOps(this);
        registerStringOps(this);
        registerIOOps(this);
    }

    /**
     * Register advanced operations
     */
    _registerAdvancedOps() {
        registerSpaceOps(this, this.context);
        registerStateOps(this);
        registerIntrospectionOps(this);
        registerTypeOps(this);
        registerBudgetOps(this);
        registerExpressionOps(this);
        registerMathOps(this);
        registerSetOps(this);
        registerHOFOps(this);
    }

    /**
     * Register placeholder operations
     */
    _registerPlaceholders() {
        ['&subst', '&match', '&type-of'].forEach(op =>
            this.register(op, () => {
                throw new Error(`${op} should be provided by Interpreter`);
            })
        );
    }
}
