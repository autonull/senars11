/**
 * ReductionPipeline.js - Pipeline-based reduction engine
 * Each optimization is a stage that can be enabled/disabled independently
 */

import { isExpression } from '../Term.js';
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
        return this.enabled ? this.process(atom, context) : null;
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
        const depth = atom.depth ?? this._calculateDepth(atom);
        return depth > this.threshold ? { useZipper: true, atom, threshold: this.threshold } : null;
    }

    _calculateDepth(atom, depth = 0) {
        if (!atom || !isExpression(atom) || !atom.components) return depth;
        return 1 + Math.max(0, ...atom.components.map(c => this._calculateDepth(c, 0)));
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
        const op = context.ground.lookup(atom.operator);
        if (!op || typeof op !== 'function') return null;
        return { executeGrounded: true, atom, op };
    }
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
 * Superpose stage - handle superpose alternatives
 */
export class SuperposeStage extends ReductionStage {
    constructor() {
        super('superpose');
    }

    /**
     * Unpack a MeTTa list (cons cells) into an array
     */
    _unpackList(term) {
        const result = [];
        let current = term;
        
        while (current && isExpression(current)) {
            const op = current.operator?.name ?? current.operator;
            if (op !== ':') break; // Not a cons cell
            
            const components = current.components;
            if (!components || components.length < 2) break;
            
            result.push(components[0]); // head
            current = components[1]; // tail
        }
        
        return result;
    }

    process(atom, context) {
        if (!isExpression(atom)) return null;
        const opName = atom.operator?.name ?? atom.operator;
        if (opName !== 'superpose') return null;
        const alternatives = atom.components ?? [];
        if (alternatives.length === 0) return { superposeEmpty: true };
        
        // Unpack list argument to get individual alternatives
        let alts = alternatives;
        if (alternatives.length === 1) {
            const first = alternatives[0];
            // Check for empty list atom ()
            const firstName = first.name ?? first;
            if (firstName === '()') {
                return { superposeEmpty: true };
            }
            // If it's an expression, use its components as alternatives
            // This handles both (superpose (A B)) and (superpose (: A (: B ())))
            if (isExpression(first)) {
                const firstOp = first.operator?.name ?? first.operator;
                if (firstOp === ':') {
                    // Cons list: unpack it
                    alts = this._unpackList(first);
                } else {
                    // Regular expression: use operator + components as alternatives
                    // (A B C) -> [A, B, C]
                    alts = [first.operator, ...(first.components ?? [])];
                }
            }
        }
        
        if (alts.length === 0) return { superposeEmpty: true };
        return { superpose: true, alternatives: alts };
    }
}

/**
 * Pipeline executor - chains stages together
 */
export class ReductionPipeline {
    constructor(config = null) {
        this.stages = [];
        this.config = config;
        this.stats = { executions: 0, stageHits: new Map(), stageTimes: new Map() };
    }

    use(stage) {
        this.stages.push(stage);
        return this;
    }

    remove(stageName) {
        this.stages = this.stages.filter(s => s.name !== stageName);
        return this;
    }

    setStageEnabled(stageName, enabled) {
        const stage = this.stages.find(s => s.name === stageName);
        if (stage) stage.enabled = enabled;
        return this;
    }

    *execute(atom, context) {
        this.stats.executions++;

        for (const stage of this.stages) {
            try {
                const stageStart = Date.now();
                const result = stage.execute(atom, context);
                const stageTime = Date.now() - stageStart;

                if (!result) continue;

                this._recordStageHit(stage.name, stageTime);

                if (result.useZipper) {
                    yield* this._executeWithZipper(result.atom, context);
                    return;
                }
                if (result.executeGrounded) {
                    yield* this._executeGrounded(result.atom, result.op, context);
                    return;
                }
                if (result.executeExplicit) {
                    yield* this._executeExplicit(result.atom, result.op, result.args, context);
                    return;
                }
                if (result.matchRules) {
                    yield* this._matchRules(result.atom, result.rules, context);
                    return;
                }
                if (result.superpose) {
                    yield* this._executeSuperpose(result.alternatives, context);
                    return;
                }
                if (result.superposeEmpty) {
                    // No alternatives - yield deadEnd signal
                    yield { reduced: atom, applied: true, deadEnd: true };
                    return;
                }
                if (result.applied) {
                    yield result;
                    return;
                }
            } catch (error) {
                console.error(`Stage ${stage.name} error:`, error);
            }
        }

        yield { reduced: atom, applied: false };
    }

    *_executeWithZipper(atom, context) {
        const zipper = new Zipper(atom);
        while (zipper.down(0)) {}

        let anyReduced = false;
        do {
            for (const res of this.execute(zipper.focus, context)) {
                if (res.applied) {
                    yield { reduced: zipper.replace(res.reduced), applied: true };
                    anyReduced = true;
                }
            }
            if (anyReduced) return;
            while (!zipper.right()) {
                if (!zipper.up()) break;
            }
        } while (zipper.depth > 0);

        yield { reduced: atom, applied: false };
    }

    *_executeGrounded(atom, op, context) {
        const args = atom.components ?? [];
        const result = op(...args);
        yield { reduced: result, applied: true, stage: 'grounded' };
    }

    *_executeExplicit(atom, op, args, context) {
        const result = op(...args);
        yield { reduced: result, applied: true, stage: 'explicit' };
    }

    *_matchRules(atom, rules, context) {
        for (const rule of rules) {
            const { pattern, result: template } = rule;
            const binds = context.Unify?.unify(pattern, atom) ?? {};
            if (binds || Object.keys(binds).length > 0) {
                const reduced = context.Unify?.subst(template, binds) ?? template;
                yield { reduced, applied: true, stage: 'rule-match' };
            }
        }
    }

    *_executeSuperpose(alternatives, context) {
        for (const alt of alternatives) {
            yield { reduced: alt, applied: true };
        }
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
            stageStats[stage.name] = {
                hits,
                totalTime: time,
                avgTime: hits > 0 ? time / hits : 0,
                enabled: stage.enabled
            };
        }
        return { executions: this.stats.executions, stages: stageStats, stageCount: this.stages.length, enabledStages: this.stages.filter(s => s.enabled).map(s => s.name) };
    }

    getProfile() {
        const stages = this.stages.map(stage => {
            const hits = this.stats.stageHits.get(stage.name) ?? 0;
            const time = this.stats.stageTimes.get(stage.name) ?? 0;
            return {
                name: stage.name,
                hits,
                totalTime: time,
                avgTime: hits > 0 ? time / hits : 0,
                enabled: stage.enabled,
                percentOfTotal: this.stats.executions > 0 ? (hits / this.stats.executions * 100).toFixed(2) + '%' : '0%'
            };
        });
        stages.sort((a, b) => b.totalTime - a.totalTime);
        return { totalExecutions: this.stats.executions, stages, bottleneck: stages[0]?.name ?? null };
    }

    resetStats() {
        this.stats.executions = 0;
        this.stats.stageHits.clear();
        this.stats.stageTimes.clear();
    }

    static createStandard(config, jitCompiler = null) {
        const pipeline = new ReductionPipeline(config);
        pipeline.use(new CacheStage());
        if (jitCompiler) pipeline.use(new JITStage(jitCompiler));
        pipeline.use(new SuperposeStage());
        pipeline.use(new ZipperStage(config?.get('zipperThreshold') ?? 2));
        pipeline.use(new GroundedOpStage());
        pipeline.use(new ExplicitCallStage());
        pipeline.use(new RuleMatchStage());
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
        this.options = {};
    }

    withCache() {
        this.stages.push(new CacheStage());
        return this;
    }

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

    withGroundedOps() {
        this.stages.push(new GroundedOpStage());
        return this;
    }

    withExplicitCalls() {
        this.stages.push(new ExplicitCallStage());
        return this;
    }

    withRuleMatching() {
        this.stages.push(new RuleMatchStage());
        return this;
    }

    withSuperpose() {
        this.stages.push(new SuperposeStage());
        return this;
    }

    withStage(stage) {
        this.stages.push(stage);
        return this;
    }

    withOptions(opts) {
        this.options = { ...this.options, ...opts };
        return this;
    }

    build() {
        const pipeline = new ReductionPipeline(this.config);
        for (const stage of this.stages) pipeline.use(stage);
        return pipeline;
    }
}
