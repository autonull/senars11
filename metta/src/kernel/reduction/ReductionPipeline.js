/**
 * ReductionPipeline.js - Pipeline-based reduction engine
 * Optimized for performance and robustness (Tier 1 & MORK-parity)
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized
 */

import { isExpression, exp, isSymbol, isVariable, equals, isList } from '../Term.js';
import { Zipper } from '../Zipper.js';
import { JITCompiler } from './JITCompiler.js';

/**
 * Base class for reduction stages
 */
export class ReductionStage {
    constructor(name) {
        this.name = name;
        this.enabled = true;
    }

    execute(atom, context) {
        if (!this.enabled) return null;
        return this.process(atom, context);
    }

    process(atom, context) {
        throw new Error('Subclasses must implement process()');
    }
}

/**
 * Cache stage - check reduction cache
 */
export class CacheStage extends ReductionStage {
    constructor() {
        super('cache');
    }

    process(atom, context) {
        if (!context.config?.get('caching') || !context.cache) return null;
        // Skip caching for primitive values (strings, numbers)
        if (typeof atom === 'string' || typeof atom === 'number') return null;
        const cached = context.cache.get(atom);
        return cached !== undefined ? { reduced: cached, applied: true, stage: 'cache', cached: true } : null;
    }
}

/**
 * JIT stage - compilation for hot paths
 */
export class JITStage extends ReductionStage {
    constructor(jitCompiler) {
        super('jit');
        this.compiler = jitCompiler;
    }

    process(atom, context) {
        if (!context.config?.get('jit')) return null;
        const jitFn = this.compiler.track(atom) ?? this.compiler.get(atom);
        if (!jitFn) return null;
        const result = jitFn(context.ground, context.space);
        return result && result !== atom ? { reduced: result, applied: true, stage: 'jit' } : null;
    }
}

/**
 * Zipper stage - traversal for deep expressions
 */
export class ZipperStage extends ReductionStage {
    constructor(threshold = 8) {
        super('zipper');
        this.threshold = threshold;
    }

    process(atom, context) {
        if (!atom || !isExpression(atom)) return null;
        
        // Don't traverse into lambda expressions - they are values
        if (atom.operator) {
            const opName = atom.operator.name ?? atom.operator;
            if (opName === 'λ' || opName === 'lambda') return null;
        }

        // Only traverse into standard expressions (Symbol operator) to avoid
        // conflicts with OperatorReduceStage
        if (!isSymbol(atom.operator)) return null;
        
        const depth = atom.depth ?? this._calculateDepth(atom);
        return depth > this.threshold ? { useZipper: true, atom, threshold: this.threshold } : null;
    }

    _calculateDepth(atom, depth = 0) {
        if (!atom || !isExpression(atom) || !atom.components) return depth;
        let maxCompDepth = atom.components.length > 0 
            ? Math.max(0, ...atom.components.map(c => this._calculateDepth(c, 0)))
            : 0;
        let maxOpDepth = atom.operator && isExpression(atom.operator) ? this._calculateDepth(atom.operator, 0) : 0;
        return 1 + Math.max(maxCompDepth, maxOpDepth);
    }
}

/**
 * GroundedOp stage - operation execution
 */
export class GroundedOpStage extends ReductionStage {
    constructor() {
        super('grounded');
    }

    process(atom, context) {
        if (!isExpression(atom) || !atom.operator) return null;

        const opName = atom.operator.name ?? atom.operator;
        let op, args, opOptions, isGroundedCall = false;

        if (opName === '^') {
            if (!atom.components || atom.components.length < 1) return null;
            const groundedOp = atom.components[0];
            op = context.ground.lookup(groundedOp);
            opOptions = context.ground.getOptions(groundedOp);
            args = atom.components.slice(1);
            isGroundedCall = true;
        } else {
            op = context.ground.lookup(atom.operator);
            opOptions = context.ground.getOptions(atom.operator);
            args = atom.components ?? [];
        }

        if (!op || typeof op !== 'function') return null;

        if (!opOptions.lazy) {
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                // Skip reduction for values (symbols, grounded, lists, simple expressions)
                if (isExpression(arg) && !isValueExpression(arg)) {
                    return { reduceArgument: true, atom, argIndex: i, arg, isGroundedCall };
                }
            }
        }

        return { executeGrounded: true, atom, op, args };
    }
}

/**
 * Check if an expression is a value (in normal form)
 */
function isValueExpression(arg) {
    // Primitive values are values
    if (typeof arg === 'string' || typeof arg === 'number') return true;
    // Lists are values
    if (isList(arg)) return true;
    // Simple expressions (operator is a symbol/number with no components) are values
    const op = arg.operator;
    if (op && (isSymbol(op) || op._typeTag === 1) && (!arg.components || arg.components.length === 0)) {
        return true;
    }
    return false;
}

/**
 * ExplicitCall stage - explicit function calls
 */
export class ExplicitCallStage extends ReductionStage {
    constructor() {
        super('explicit-call');
    }

    process(atom, context) {
        if (!isExpression(atom) || !atom.operator) return null;
        const opName = atom.operator.name ?? atom.operator;
        if (typeof opName !== 'string' || !opName.startsWith('&')) return null;
        const op = context.ground.lookup(atom.operator);
        if (!op || typeof op !== 'function') return null;
        const args = atom.components ?? [];
        return { executeExplicit: true, atom, op, args };
    }
}

/**
 * RuleMatch stage - pattern matching against space rules
 */
export class RuleMatchStage extends ReductionStage {
    constructor() {
        super('rule-match');
    }

    process(atom, context) {
        if (!context.space) return null;
        const rules = context.space.rulesFor(atom);
        if (!rules || rules.length === 0) return null;
        return { matchRules: true, atom, rules };
    }
}

/**
 * OperatorReduce stage - reduce the operator of an expression
 */
export class OperatorReduceStage extends ReductionStage {
    constructor() {
        super('operator-reduce');
    }

    process(atom, context) {
        if (!isExpression(atom) || !atom.operator || !isExpression(atom.operator)) return null;
        return { reduceOperator: true, atom };
    }
}

/**
 * Superpose stage - handle superpose alternatives
 */
export class SuperposeStage extends ReductionStage {
    constructor() {
        super('superpose');
    }

    _unpackList(term) {
        const result = [];
        let current = term;
        while (current && isExpression(current)) {
            const op = current.operator?.name ?? current.operator;
            if (op !== ':') break;
            const components = current.components;
            if (!components || components.length < 2) break;
            result.push(components[0]);
            current = components[1];
        }
        return result;
    }

    _findSuperpose(atom) {
        if (!isExpression(atom)) return null;
        const opName = atom.operator?.name ?? atom.operator;
        if (opName === 'superpose') return { atom, path: [] };
        for (let i = 0; i < atom.components.length; i++) {
            const found = this._findSuperpose(atom.components[i]);
            if (found) return { atom: found.atom, path: [i, ...found.path] };
        }
        return null;
    }

    process(atom, context) {
        if (!isExpression(atom)) return null;
        const opName = atom.operator?.name ?? atom.operator;
        if (opName !== 'superpose') {
            const found = this._findSuperpose(atom);
            if (found) {
                const parentOp = typeof opName === 'string' ? opName : (opName?.name ?? '');
                const nonDetOps = ['collapse', 'collapse-n', 'superpose', 'superpose-weighted'];
                if (nonDetOps.includes(parentOp)) return null;
                return { reduceNestedSuperpose: true, atom, superposeAtom: found.atom, path: found.path };
            }
            return null;
        }

        const alternatives = atom.components ?? [];
        if (alternatives.length === 0) return { superposeEmpty: true };
        let alts = alternatives;
        if (alternatives.length === 1) {
            const first = alternatives[0];
            if (first.name === '()') return { superposeEmpty: true };
            if (isExpression(first)) {
                const firstOp = first.operator?.name ?? first.operator;
                if (firstOp === ':') alts = this._unpackList(first);
                else alts = [first.operator, ...(first.components ?? [])];
            }
        }
        if (alts.length === 0) return { superposeEmpty: true };
        return { superpose: true, alternatives: alts };
    }
}

/**
 * Pipeline executor - chains stages together with robust fallback
 */
export class ReductionPipeline {
    constructor(config = null) {
        this.stages = [];
        this.config = config;
        this.stats = { executions: 0, stageHits: new Map(), stageTimes: new Map() };
    }

    use(stage) { this.stages.push(stage); return this; }
    remove(stageName) { this.stages = this.stages.filter(s => s.name !== stageName); return this; }
    setStageEnabled(stageName, enabled) {
        const stage = this.stages.find(s => s.name === stageName);
        if (stage) stage.enabled = enabled;
        return this;
    }

    *execute(atom, context) {
        if (context.limit !== undefined && context.limit !== null && context.steps >= context.limit) {
            throw new Error(`Max steps exceeded: ${context.limit} steps`);
        }
        this.stats.executions++;
        for (const stage of this.stages) {
            const stageStart = Date.now();
            let result;
            try {
                result = stage.execute(atom, context);
            } catch (e) {
                if (e.message.startsWith('Max steps exceeded')) throw e;
                console.error(`ReductionStage ${stage.name} error:`, e);
                continue;
            }
            const stageTime = Date.now() - stageStart;
            if (!result) continue;
            this._recordStageHit(stage.name, stageTime);

            let stageGenerator = null;
            if (result.useZipper) stageGenerator = this._executeWithZipper(result.atom, context);
            else if (result.executeGrounded) stageGenerator = this._executeGrounded(result.atom, result.op, result.args, context);
            else if (result.executeExplicit) stageGenerator = this._executeExplicit(result.atom, result.op, result.args, context);
            else if (result.matchRules) stageGenerator = this._matchRules(result.atom, result.rules, context);
            else if (result.reduceOperator) stageGenerator = this._reduceOperator(result.atom, context);
            else if (result.reduceArgument) stageGenerator = this._reduceArgument(result.atom, result.argIndex, result.arg, context);
            else if (result.reduceNestedSuperpose) stageGenerator = this._reduceNestedSuperpose(result.atom, result.superposeAtom, result.path, context);
            else if (result.superpose) stageGenerator = this._executeSuperpose(result.alternatives, context);
            else if (result.superposeEmpty) {
                yield { reduced: atom, applied: true, deadEnd: true };
                return;
            } else if (result.applied) {
                yield result;
                return;
            }

            if (stageGenerator) {
                let anyApplied = false;
                for (const res of stageGenerator) {
                    if (res.applied) {
                        yield res;
                        anyApplied = true;
                    }
                }
                if (anyApplied) return;
            }
        }
        yield { reduced: atom, applied: false };
    }

    *_executeWithZipper(atom, context) {
        if (atom.operator && isExpression(atom.operator)) {
            for (const res of this.execute(atom.operator, context)) {
                if (res.applied && !equals(res.reduced, atom.operator)) {
                    yield { reduced: exp(res.reduced, atom.components), applied: true, stage: 'zipper-op' };
                    return;
                }
            }
        }
        const zipper = new Zipper(atom);
        while (zipper.down(0)) {}
        do {
            let focusApplied = false;
            for (const res of this.execute(zipper.focus, context)) {
                if (res.applied && !equals(res.reduced, zipper.focus)) {
                    yield { reduced: zipper.replace(res.reduced), applied: true, stage: 'zipper-focus' };
                    focusApplied = true;
                }
            }
            if (focusApplied) return;
            while (!zipper.right()) if (!zipper.up()) break;
        } while (zipper.depth > 0);
    }

    *_executeGrounded(atom, op, args, context) {
        try {
            const result = op(...args);
            if (result !== undefined && result !== null && !equals(result, atom)) {
                 yield { reduced: result, applied: true, stage: 'grounded' };
            }
        } catch (e) {
            if (args.every(a => !isExpression(a)) && !args.some(isVariable)) throw e;
        }
    }

    *_executeExplicit(atom, op, args, context) {
        try {
            const result = op(...args);
            if (result !== undefined && result !== null && !equals(result, atom)) {
                 yield { reduced: result, applied: true, stage: 'explicit' };
            }
        } catch (e) { }
    }

    *_matchRules(atom, rules, context) {
        for (const rule of rules) {
            const { pattern, result: template } = rule;
            if (template === undefined) continue;
            const binds = context.Unify?.unify(pattern, atom);
            if (binds !== null && binds !== undefined) {
                let reduced;
                if (typeof template === 'function') reduced = template(binds);
                else reduced = context.Unify?.subst(template, binds, { recursive: false });
                if (reduced !== undefined && reduced !== null) {
                    // Yield even if reduced is equal to atom to allow infinite loop
                    // detection in test cases like (loop $x) -> (loop $x)
                    yield { reduced, applied: true, stage: 'rule-match' };
                }
            }
        }
    }

    *_reduceOperator(atom, context) {
        const op = atom.operator;
        for (const res of this.execute(op, context)) {
            if (res.applied && !equals(res.reduced, op)) {
                yield { reduced: exp(res.reduced, atom.components), applied: true, stage: 'operator-reduce' };
                return;
            }
        }
    }

    *_reduceArgument(atom, argIndex, arg, context) {
        for (const res of this.execute(arg, context)) {
            if (res.applied && !equals(res.reduced, arg)) {
                const newArgs = [...atom.components];
                const componentIndex = argIndex + (atom.operator?.name === '^' ? 1 : 0);
                newArgs[componentIndex] = res.reduced;
                yield { reduced: exp(atom.operator, newArgs), applied: true, stage: 'argument-reduce' };
                return;
            }
        }
    }

    *_reduceNestedSuperpose(atom, superposeAtom, path, context) {
        for (const alt of this._unpackSuperpose(superposeAtom, context)) {
            yield { reduced: this._replaceAtPath(atom, path, alt), applied: true, stage: 'nested-superpose' };
        }
    }

    _unpackSuperpose(superposeAtom, context) {
        const alternatives = superposeAtom.components ?? [];
        if (alternatives.length === 0) return [];
        let alts = alternatives;
        if (alternatives.length === 1) {
            const first = alternatives[0];
            if (first.name === '()') return [];
            if (isExpression(first)) {
                if (first.operator?.name === ':') alts = this._unpackList(first);
                else alts = [first.operator, ...(first.components ?? [])];
            }
        }
        return alts;
    }

    _replaceAtPath(atom, path, replacement) {
        if (path.length === 0) return replacement;
        const newComps = [...atom.components];
        const [first, ...rest] = path;
        if (rest.length === 0) newComps[first] = replacement;
        else newComps[first] = this._replaceAtPath(atom.components[first], rest, replacement);
        return exp(atom.operator, newComps);
    }

    *_executeSuperpose(alternatives, context) {
        for (const alt of alternatives) yield { reduced: alt, applied: true };
    }

    _recordStageHit(stageName, duration = 0) {
        const count = this.stats.stageHits.get(stageName) ?? 0;
        const time = this.stats.stageTimes.get(stageName) ?? 0;
        this.stats.stageHits.set(stageName, count + 1);
        this.stats.stageTimes.set(stageName, time + duration);
    }

    getStats() {
        const stageStats = {};
        for (const stage of this.stages) {
            const hits = this.stats.stageHits.get(stage.name) ?? 0;
            const time = this.stats.stageTimes.get(stage.name) ?? 0;
            stageStats[stage.name] = { hits, totalTime: time, avgTime: hits > 0 ? time / hits : 0, enabled: stage.enabled };
        }
        return { executions: this.stats.executions, stages: stageStats, stageCount: this.stages.length, enabledStages: this.stages.filter(s => s.enabled).map(s => s.name) };
    }

    getProfile() {
        const stats = this.getStats();
        return {
            totalExecutions: stats.executions,
            stages: Object.entries(stats.stages).map(([name, s]) => ({
                name,
                hits: s.hits,
                totalTime: s.totalTime,
                avgTime: s.avgTime
            }))
        };
    }

    resetStats() {
        this.stats = { executions: 0, stageHits: new Map(), stageTimes: new Map() };
        return this;
    }

    static createStandard(config, jitCompiler = null) {
        const pipeline = new ReductionPipeline(config);
        pipeline.use(new CacheStage());
        if (jitCompiler) pipeline.use(new JITStage(jitCompiler));
        pipeline.use(new SuperposeStage());
        pipeline.use(new RuleMatchStage());
        pipeline.use(new OperatorReduceStage());
        pipeline.use(new ZipperStage(config?.get('zipperThreshold') ?? 1));
        pipeline.use(new GroundedOpStage());
        pipeline.use(new ExplicitCallStage());
        return pipeline;
    }
}

/**
 * Fluent Pipeline Builder
 */
export class PipelineBuilder {
    constructor(config) {
        this.config = config;
        this.stages = [];
    }

    withCache() { this.stages.push(new CacheStage()); return this; }
    withJIT(options = {}) {
        const threshold = options.threshold ?? this.config?.get('jitThreshold') ?? 50;
        this.stages.push(new JITStage(new JITCompiler(threshold)));
        return this;
    }
    withZipper(options = {}) {
        const threshold = options.threshold ?? this.config?.get('zipperThreshold') ?? 8;
        this.stages.push(new ZipperStage(threshold));
        return this;
    }
    withGroundedOps() { this.stages.push(new GroundedOpStage()); return this; }
    withExplicitCalls() { this.stages.push(new ExplicitCallStage()); return this; }
    withRuleMatching() { this.stages.push(new RuleMatchStage()); return this; }
    withSuperpose() { this.stages.push(new SuperposeStage()); return this; }
    withStage(stage) { this.stages.push(stage); return this; }
    build() {
        const pipeline = new ReductionPipeline(this.config);
        for (const stage of this.stages) pipeline.use(stage);
        return pipeline;
    }
}
