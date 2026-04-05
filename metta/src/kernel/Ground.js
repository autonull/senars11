import {sym} from './Term.js';
import {
    CoreRegistry,
    OperationHelpers,
    registerArithmeticOps,
    registerBudgetOps,
    registerComparisonOps,
    registerExpressionOps,
    registerIntrospectionOps,
    registerLogicalOps,
    registerMetaprogrammingOps,
    registerStringOps
} from './ops/index.js';
import {configManager} from '../config/config.js';
import {registerListOps} from './ops/ListOps.js';
import {registerIOOps} from './ops/IOOps.js';
import {registerSpaceOps} from './ops/SpaceOps.js';
import {registerStateOps} from './ops/StateOps.js';
import {registerTypeOps} from './ops/TypeOps.js';
import {registerMathOps} from './ops/MathOps.js';
import {registerSetOps} from './ops/SetOps.js';
import {registerHOFOps} from './ops/HOFOps.js';
import {registerReflectionOps} from './ops/ReflectionOps.js';

const AsyncFunction = Object.getPrototypeOf(async function () {
}).constructor;
const isAsyncFunction = fn => fn instanceof AsyncFunction;

export class Ground extends CoreRegistry {
    #normalizedCache = new Map();
    #opsById = [];
    #nameToId = new Map();
    #nextId = 0;
    #fastPathsEnabled = configManager.get('fastPaths');

    constructor(context = {}) {
        super();
        this.context = context;
        this.opsById = this.#opsById;
        this.nameToId = this.#nameToId;
        this.nextId = this.#nextId;
        this._registerCoreOperations();
    }

    _atomToNum(atom) {
        return OperationHelpers.atomToNum(atom);
    }

    _requireNums(args, count = null) {
        return OperationHelpers.requireNums(args, count);
    }

    _bool(val) {
        return OperationHelpers.bool(val);
    }

    _truthy(val) {
        return OperationHelpers.truthy(val);
    }

    _flattenExpr(expr) {
        return OperationHelpers.flattenExpr(expr);
    }

    _listify(arr) {
        return OperationHelpers.listify(arr);
    }

    _isList(atom) {
        return OperationHelpers.isList(atom);
    }

    register(name, op, options = {}) {
        const normalizedOptions = {...options, async: options.async ?? isAsyncFunction(op)};
        super.register(name, op, normalizedOptions);

        if (this.#fastPathsEnabled) {
            const id = this.#nextId++;
            this.#nameToId.set(name, id);
            this.#opsById[id] = {op, options: normalizedOptions};
            if (op && typeof op === 'object') {
                op._opId = id;
                op._async = normalizedOptions.async;
            }
        }
    }

    lookup(symbol) {
        const name = symbol.name ?? symbol;
        if (this.#fastPathsEnabled) {
            if (symbol._opId !== undefined) {
                return this.#opsById[symbol._opId]?.op;
            }
            const id = this.#nameToId.get(name);
            if (id !== undefined) {
                return this.#opsById[id]?.op;
            }
        }
        return this.operations.get(this.#getNormalized(name))?.fn;
    }

    get(name) {
        return this.lookup(typeof name === 'string' ? {name} : name);
    }

    getOptions(name) {
        const n = typeof name === 'string' ? name : name?.name;
        if (!n) {
            return {};
        }
        if (this.#fastPathsEnabled) {
            const id = this.#nameToId.get(n);
            if (id !== undefined) {
                return this.#opsById[id]?.options ?? {};
            }
        }
        return this.operations.get(this._normalize(n))?.options ?? {};
    }

    async executeAsync(name, ...args) {
        const n = typeof name === 'string' ? name : name?.name;
        if (!n) {
            throw new Error(`Invalid operation name: ${name}`);
        }
        const options = this.getOptions(n);
        const op = this.lookup({name: n});
        if (!op) {
            throw new Error(`Operation not found: ${n}`);
        }
        return options.async ? await op(...args) : op(...args);
    }

    isAsync(name) {
        return this.getOptions(name).async === true;
    }

    getOperationsWithMeta() {
        return [...this.operations.entries()].map(([name, entry]) => ({
            name,
            async: entry.options?.async ?? false,
            lazy: entry.options?.lazy ?? false,
            pure: entry.options?.pure ?? false
        }));
    }

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

    #getNormalized(name) {
        if (this.#normalizedCache.has(name)) {
            return this.#normalizedCache.get(name);
        }
        const normalized = name.startsWith('&') ? name : `&${name}`;
        return this.#normalizedCache.set(name, normalized), normalized;
    }
}
