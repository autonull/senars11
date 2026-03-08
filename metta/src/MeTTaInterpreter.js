/**
 * MeTTaInterpreter.js - Main Interpreter
 * Components wiring and standard library loading.
 * With Tier 1 Performance Optimization: Reduction Result Caching (Q5)
 */

// Standard library imports
import { TermFactory } from '../../core/src/term/TermFactory.js';
import {Logger} from '../../core/src/util/Logger.js';

// Module Loader
import { ModuleLoader } from './kernel/ModuleLoader.js';

// Local imports grouped by category
// Core components
import { BaseMeTTaComponent } from './helpers/BaseMeTTaComponent.js';
import { Parser } from './Parser.js';
import { TypeChecker, TypeSystem } from './TypeSystem.js';

// Kernel components
import { objToBindingsAtom, bindingsAtomToObj } from './kernel/Bindings.js';
import { Ground } from './kernel/Ground.js';
import { MemoizationCache } from './kernel/MemoizationCache.js';
import { ReductionCache } from './kernel/ReductionCache.js';
import { reduceND, reduceNDAsync, setReduceNDInternalReference } from './kernel/Reduce.js';
import { Space } from './kernel/Space.js';
import { Term, isList, flattenList, isExpression } from './kernel/Term.js';
import { Unify } from './kernel/Unify.js';
import { Formatter } from './kernel/Formatter.js';

// Configuration (new architecture)
import { ConfigManager, createMeTTaConfig, ExtensionRegistry, registerMeTTaExtensions } from './config/index.js';
import { registerConfigOps } from './kernel/ops/StateOps.js';

// Extensions
import { ReactiveSpace } from './extensions/ReactiveSpace.js';
import { ChannelExtension } from './extensions/ChannelExtension.js';
import { NeuralBridge } from './extensions/NeuralBridge.js';

// ImaginationExtension is loaded lazily to avoid hard dependency on @napi-rs/canvas
let ImaginationExtension = null;

// Standard library
import { loadStdlib } from './stdlib/StdlibLoader.js';

// Platform
import { WorkerPool } from './platform/WorkerPool.js';
import { ENV } from './platform/env.js';

// Operations
import { registerAdvancedOps } from './interp/AdvancedOps.js';
import { registerReactiveOps } from './interp/ReactiveOps.js';
import { registerParallelOps } from './interp/ParallelOps.js';
import { registerHofOps } from './interp/HOFInterpreterOps.js';
import { registerMinimalOps } from './interp/MinimalOps.js';

export class MeTTaInterpreter extends BaseMeTTaComponent {
    constructor(reasoner, options = {}) {
        // Normalize arguments: if reasoner is actually options object, swap
        if (reasoner && typeof reasoner === 'object' && !Object.keys(options).length) {
            options = reasoner;
            reasoner = null;
        }

        const opts = { maxReductionSteps: 1000, ...options };
        if (!opts.termFactory) opts.termFactory = new TermFactory();

        super(opts, 'MeTTaInterpreter', opts.eventBus, opts.termFactory);

        this.reasoner = reasoner;
        
        // New architecture: ConfigManager
        this.config = createMeTTaConfig();
        
        this.space = new ReactiveSpace();
        this.spaces = new Map();
        this.moduleLoader = new ModuleLoader(this);
        this.ground = new Ground(this);
        this.parser = new Parser();
        this.typeSystem = new TypeSystem();
        this.typeChecker = new TypeChecker(this.typeSystem);

        // Legacy cache
        this.memoCache = new MemoizationCache(opts.cacheCapacity || 1000);

        // Q5: New ReductionCache
        this.reductionCache = new ReductionCache(opts.cacheCapacity || 1000);

        // New architecture: ExtensionRegistry
        this.extensionRegistry = new ExtensionRegistry(this);
        registerMeTTaExtensions(this.extensionRegistry);

        // Circular Dependency Resolution: Inject dependencies into reduction modules
        this._injectReductionDependencies();

        // Register config operations for runtime modification
        registerConfigOps(this.ground, this.config);

        this._initializeOperations();
        this._initializeBridge();
        this._initializeExtensions(options);
        this._loadStandardLibrary();
    }

    /**
     * Inject function references to break circular dependencies in reduction logic
     */
    _injectReductionDependencies() {
        // With ReductionPipeline, circular deps are handled via the reduceND reference
        setReduceNDInternalReference(reduceND);
    }

    /**
     * Initialize all operation sets in proper order
     */
    _initializeOperations() {
        for (const registerFn of [registerAdvancedOps, registerReactiveOps, registerParallelOps, registerMinimalOps, registerHofOps]) {
            registerFn(this);
        }
    }

    /**
     * Register extensions like Channels
     */
    async _initializeExtensions(options) {
        if (options.channelManager) {
            const channelExt = new ChannelExtension(this, options.channelManager);
            channelExt.register();
        }

        // Load extensions based on config
        const extensionsToLoad = [];
        if (this.config.get('tensor')) extensionsToLoad.push('neural-bridge');
        if (this.config.get('smt')) extensionsToLoad.push('smt-bridge');
        if (this.config.get('debugging')) extensionsToLoad.push('visual-debugger');

        if (extensionsToLoad.length > 0) {
            await this.extensionRegistry.loadAll(extensionsToLoad);
        }

        // Lazily load ImaginationExtension if available (requires @napi-rs/canvas)
        (async () => {
            if (!ImaginationExtension) {
                try {
                    const mod = await import('./extensions/ImaginationExtension.js');
                    ImaginationExtension = mod.ImaginationExtension;
                } catch (e) {
                    ImaginationExtension = null;
                }
            }
            if (ImaginationExtension) {
                const imaginationExt = new ImaginationExtension(this, this.reasoner);
                imaginationExt.register();
            }
        })();
    }

    /**
     * Register bridge primitives if available
     */
    _initializeBridge() {
        const bridge = this.reasoner?.bridge || this.config.bridge;
        bridge?.registerPrimitives?.(this.ground);

        // Phase P3-C: Tensor integration registry (loaded via ExtensionRegistry if enabled)
        // If tensor is enabled but extension not loaded yet, load it
        if (this.config.get('tensor') && !this.extensionRegistry.isLoaded('neural-bridge')) {
            NeuralBridge.register(this.ground);
        }
    }

    /**
     * Load standard library if enabled
     */
    _loadStandardLibrary() {
        if (this.config.loadStdlib !== false) {
            try {
                loadStdlib(this, this.config);
            } catch (e) {
                Logger.warn("Stdlib load failed:", e.message);
            }
        }
    }

    /**
     * Convert array to list representation
     */
    _listify(arr) {
        let list = Term.sym('()');
        for (let i = arr.length - 1; i >= 0; i--) {
            list = Term.exp(':', [arr[i], list]);
        }
        return list;
    }

    /**
     * Handle let* sequential bindings
     */
    _handleLetStar(bindings, body) {
        const { flattenList, sym, exp } = Term;

        // Extract pairs based on binding structure
        const pairs = this._extractLetStarPairs(bindings);
        if (!pairs.length) return reduce(body, this.space, this.ground);

        const [first, ...rest] = pairs;
        if (!first?.components?.length) return body;

        // Extract variable and value
        const [v, val] = this._extractVarAndValue(first);
        if (!v || !val) return body;

        const inner = rest.length ? exp(sym('let*'), [exp(rest[0], rest.slice(1)), body]) : body;
        return reduce(exp(sym('let'), [v, val, inner]), this.space, this.ground);
    }

    /**
     * Extract pairs from let* bindings based on structure
     */
    _extractLetStarPairs(bindings) {
        if (bindings.operator?.name === ':') {
            return flattenList(bindings).elements;
        } else if (bindings.type === 'compound') {
            return [bindings.operator, ...bindings.components];
        } else if (bindings.name !== '()') {
            Logger.error('Invalid &let* bindings', bindings);
            return [];
        }
        return [];
    }

    /**
     * Extract variable and value from a binding pair
     */
    _extractVarAndValue(binding) {
        return binding.operator?.name === ':' ? binding.components : [binding.operator, binding.components[0]];
    }

    /**
     * Flatten list structure to array
     */
    _flattenToList(atom) {
        if (!atom || atom.name === '()') return [];
        if (isList(atom)) return flattenList(atom).elements;
        // Fallback for non-list compounds (legacy/specific behavior)
        if (isExpression(atom)) return [atom.operator, ...atom.components];
        return [atom];
    }

    /**
     * Determine truthiness of an atom
     */
    _truthy(atom) {
        return atom && !['False', '()', 'Empty'].includes(atom.name);
    }

    /**
     * Execute a program string
     */
    run(code) {
        return this.trackOperation('run', () => {
            const exprs = this.parser.parseProgram(code);
            const res = [];

            for (let i = 0; i < exprs.length; i++) {
                const e = exprs[i];

                if (e.name === '!' && i + 1 < exprs.length) {
                    const evalRes = this.evaluate(exprs[++i]);
                    Array.isArray(evalRes) ? res.push(...evalRes) : res.push(evalRes);
                    continue;
                }

                this._processExpression(e, res);
            }

            res.toString = () => Formatter.formatResult(res);
            return res;
        });
    }

    /**
     * Load code into the space without evaluating
     */
    load(code) {
        return this.parser.parseProgram(code).map(e => {
            this._processExpression(e, null);
            return { term: e };
        });
    }

    /**
     * Process a single expression (add rule or evaluate)
     */
    _processExpression(expr, results) {
        const isRule = (expr.operator === '=' || expr.operator?.name === '=') && expr.components?.length === 2;

        if (isRule) {
            this.space.addRule(expr.components[0], expr.components[1]);
            if (results) results.push(expr);
            return;
        }

        if (!results) {
            this.space.add(expr);
            return;
        }

        const evalRes = this.evaluate(expr);
        const items = Array.isArray(evalRes) ? evalRes : [evalRes];
        results.push(...items);
        for (const r of items) {
            this.space.add(r);
        }
    }

    /**
     * Evaluate an atom with non-deterministic reduction
     */
    evaluate(atom) {
        return this.trackOperation('evaluate', () => {
            const res = reduceND(atom, this.space, this.ground, this.config.maxReductionSteps);
            const steps = this._mettaMetrics.get('reductionSteps') || 0;
            this._mettaMetrics.set('reductionSteps', steps + 1);
            return res;
        });
    }

    /**
     * Helper method to perform deterministic reduction with common parameters
     */
    _reduceDeterministic(atom) {
        return reduce(atom, this.space, this.ground, this.config.maxReductionSteps, this.reductionCache);
    }

    /**
     * Perform a single reduction step
     */
    step(atom) {
        return step(atom, this.space, this.ground, this.config.maxReductionSteps, this.reductionCache);
    }

    /**
     * Query the space for matching patterns
     */
    query(pattern, template) {
        const p = typeof pattern === 'string' ? this.parser.parse(pattern) : pattern;
        const t = typeof template === 'string' ? this.parser.parse(template) : template;
        const res = match(this.space, p, t);
        res.toString = () => Formatter.formatResult(res);
        return res;
    }

    /**
     * Get interpreter statistics
     */
    getStats() {
        return {
            space: this.space.getStats(),
            groundedAtoms: { count: this.ground.getOperations().length },
            reductionEngine: { maxSteps: this.config.maxReductionSteps || 10000 },
            typeSystem: {
                count: this.typeSystem ? 1 : 0,
                typeVariables: this.typeSystem?.nextTypeVarId || 0
            },
            groundOps: this.ground.getOperations().length,
            reductionCache: this.reductionCache.stats(),
            ...super.getStats()
        };
    }

    /**
     * Run code asynchronously
     */
    async runAsync(code) {
        return this.trackOperation('run', async () => {
            const exprs = this.parser.parseProgram(code);
            const res = [];

            for (let i = 0; i < exprs.length; i++) {
                const e = exprs[i];
                if (e.name === '!' && i + 1 < exprs.length) {
                    const evalRes = await this.evaluateAsync(exprs[++i]);
                    if (Array.isArray(evalRes)) res.push(...evalRes);
                    else res.push(evalRes);
                    continue;
                }

                if ((e.operator === '=' || e.operator?.name === '=') && e.components?.length === 2) {
                    this.space.addRule(e.components[0], e.components[1]);
                } else {
                    this.space.add(e);
                }
            }
            res.toString = () => Formatter.formatResult(res);
            return res;
        });
    }

    /**
     * Evaluate asynchronously
     */
    async evaluateAsync(atom) {
        return this.trackOperation('evaluate', async () => {
            const res = await reduceNDAsync(atom, this.space, this.ground, this.config.maxReductionSteps);
            const steps = this._mettaMetrics.get('reductionSteps') || 0;
            this._mettaMetrics.set('reductionSteps', steps + 1);
            return res;
        });
    }
}
