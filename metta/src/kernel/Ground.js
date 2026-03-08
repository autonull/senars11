/**
 * Ground.js - Native function registry for grounded operations
 * Performance optimized with operation lookup caching (Q4)
 */

import { sym, exp, isExpression, constructList, isList, flattenList } from './Term.js';
import { Unify } from './Unify.js';
import { OperationHelpers } from './ops/OperationHelpers.js';
import { CoreRegistry } from './ops/CoreRegistry.js';
import { configManager } from '../config/config.js';

// Operation registration modules
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
import { registerReflectionOps } from './ops/ReflectionOps.js';

const AsyncFunction = (async () => {}).constructor;
const isAsyncFunction = fn => fn instanceof AsyncFunction;

export class Ground extends CoreRegistry {
    constructor(context = {}) {
        super();
        this.context = context;
        this._fastPathsEnabled = configManager.get('fastPaths');
        this._normalizedCache = new Map();
        this.opsById = [];
        this.nameToId = new Map();
        this.nextId = 0;

        this._registerCoreOperations();
    }

    // === Helper Methods (delegated to OperationHelpers) ===

    _atomToNum(atom) { return OperationHelpers.atomToNum(atom); }
    _requireNums(args, count = null) { return OperationHelpers.requireNums(args, count); }
    _bool(val) { return OperationHelpers.bool(val); }
    _truthy(val) { return OperationHelpers.truthy(val); }
    _flattenExpr(expr) { return OperationHelpers.flattenExpr(expr); }
    _listify(arr) { return OperationHelpers.listify(arr); }
    _isList(atom) { return OperationHelpers.isList(atom); }

    // === Registration ===

    register(name, op, options = {}) {
        const normalizedOptions = { ...options, async: options.async ?? isAsyncFunction(op) };
        super.register(name, op, normalizedOptions);

        if (this._fastPathsEnabled) {
            const id = this.nextId++;
            this.nameToId.set(name, id);
            this.opsById[id] = { op, options: normalizedOptions };

            if (op && typeof op === 'object') {
                op._opId = id;
                op._async = normalizedOptions.async;
            }
        }
    }

    lookup(symbol) {
        const name = symbol.name ?? symbol;

        if (this._fastPathsEnabled) {
            if (symbol._opId !== undefined) return this.opsById[symbol._opId]?.op;
            const id = this.nameToId.get(name);
            if (id !== undefined) return this.opsById[id]?.op;
        }

        const normalized = this._getNormalized(name);
        return this.operations.get(normalized)?.fn;
    }

    get(name) {
        return this.lookup(typeof name === 'string' ? { name } : name);
    }

    getOptions(name) {
        const n = typeof name === 'string' ? name : name?.name;
        if (!n) return {};

        if (this._fastPathsEnabled) {
            const id = this.nameToId.get(n);
            if (id !== undefined) return this.opsById[id]?.options ?? {};
        }

        const entry = this.operations.get(this._normalize(n));
        return entry?.options ?? {};
    }

    async executeAsync(name, ...args) {
        const n = typeof name === 'string' ? name : name?.name;
        if (!n) throw new Error(`Invalid operation name: ${name}`);

        const options = this.getOptions(n);
        const op = this.lookup({ name: n });
        if (!op) throw new Error(`Operation not found: ${n}`);

        return options.async ? await op(...args) : op(...args);
    }

    isAsync(name) {
        return this.getOptions(name).async === true;
    }

    getOperationsWithMeta() {
        return Array.from(this.operations.entries()).map(([name, entry]) => ({
            name,
            async: entry.options?.async ?? false,
            lazy: entry.options?.lazy ?? false,
            pure: entry.options?.pure ?? false
        }));
    }

    // === Registration Helpers ===

    _registerCoreOperations() {
        this._registerBasicOps();
        this._registerAdvancedOps();
        this.register('&now', () => sym(String(Date.now())));
        this._registerPlaceholders();
        registerMetaprogrammingOps(this);
    }

    _registerBasicOps() {
        registerArithmeticOps(this);
        registerComparisonOps(this);
        registerLogicalOps(this);
        registerListOps(this);
        registerStringOps(this);
        registerIOOps(this);
    }

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
        registerReflectionOps(this);
    }

    _registerPlaceholders() {
        ['&subst', '&match', '&type-of'].forEach(op =>
            this.register(op, () => {
                throw new Error(`${op} should be provided by Interpreter`);
            })
        );
    }

    _getNormalized(name) {
        if (this._normalizedCache.has(name)) return this._normalizedCache.get(name);
        const normalized = name.startsWith('&') ? name : `&${name}`;
        this._normalizedCache.set(name, normalized);
        return normalized;
    }
}
