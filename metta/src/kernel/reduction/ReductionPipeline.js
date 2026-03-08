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
    if (!this.enabled) return null;
    return this.process(atom, context);
  }

  process(atom, context) {
    throw new Error('Subclasses must implement process()');
  }
}

/**
 * Stage: Check reduction cache
 */
export class CacheStage extends ReductionStage {
  constructor() {
    super('cache');
  }

  process(atom, context) {
    if (!context.config?.get('caching') || !context.cache) return null;
    
    const cached = context.cache.get(atom);
    if (cached !== undefined) {
      return { reduced: cached, applied: true, stage: 'cache', cached: true };
    }
    return null;
  }
}

/**
 * Stage: JIT compilation for hot paths
 */
export class JITStage extends ReductionStage {
  constructor(jitCompiler) {
    super('jit');
    this.compiler = jitCompiler;
  }

  process(atom, context) {
    if (!context.config?.get('jit')) return null;
    
    const jitFn = this.compiler.track(atom) || this.compiler.get(atom);
    if (jitFn) {
      const result = jitFn(context.ground, context.space);
      if (result && result !== atom) {
        return { reduced: result, applied: true, stage: 'jit' };
      }
    }
    return null;
  }
}

/**
 * Stage: Zipper-based traversal for deep expressions
 */
export class ZipperStage extends ReductionStage {
  constructor(threshold = 8) {
    super('zipper');
    this.threshold = threshold;
  }

  process(atom, context) {
    const depth = atom.depth || this._calculateDepth(atom);
    if (depth > this.threshold) {
      // Return special marker for zipper processing
      return { useZipper: true, atom, threshold: this.threshold };
    }
    return null;
  }

  _calculateDepth(atom, depth = 0) {
    if (!atom || !isExpression(atom) || !atom.components) return depth;
    return 1 + Math.max(0, ...atom.components.map(c => this._calculateDepth(c, 0)));
  }
}

/**
 * Stage: Grounded operation execution
 */
export class GroundedOpStage extends ReductionStage {
  constructor() {
    super('grounded');
  }

  process(atom, context) {
    if (!isExpression(atom)) return null;
    
    const opName = atom.operator?.name;
    if (!opName || opName === '^') return null;
    
    if (context.ground?.has(atom.operator)) {
      return { executeGrounded: true, atom, op: atom.operator };
    }
    return null;
  }
}

/**
 * Stage: Explicit grounded call (^)
 */
export class ExplicitCallStage extends ReductionStage {
  constructor() {
    super('explicit-call');
  }

  process(atom, context) {
    if (!isExpression(atom)) return null;
    
    const opName = atom.operator?.name;
    if (opName !== '^') return null;
    
    const comps = atom.components;
    if (!comps || comps.length === 0) return null;
    
    const opCandidate = comps[0];
    if (context.ground?.has(opCandidate) || (opCandidate.name && context.ground?.has(opCandidate.name))) {
      return { executeExplicit: true, atom, op: opCandidate, args: comps.slice(1) };
    }
    return null;
  }
}

/**
 * Stage: Rule matching
 */
export class RuleMatchStage extends ReductionStage {
  constructor() {
    super('rule-match');
  }

  process(atom, context) {
    if (!isExpression(atom)) return null;
    
    const rules = context.space?.rulesFor?.(atom) || [];
    if (rules.length === 0) return null;
    
    return { matchRules: true, atom, rules };
  }
}

/**
 * Stage: Superpose handling
 */
export class SuperposeStage extends ReductionStage {
  constructor() {
    super('superpose');
  }

  process(atom, context) {
    if (!isExpression(atom)) return null;
    
    const opName = atom.operator?.name;
    if (opName !== 'superpose-internal') return null;
    
    const comps = atom.components;
    if (!comps || comps.length === 0) {
      return { superposeEmpty: true };
    }
    
    return { superpose: true, alternatives: comps };
  }
}

/**
 * Stage: Profiling/tracing
 */
export class ProfileStage extends ReductionStage {
  constructor(onEnter, onExit) {
    super('profile');
    this.onEnter = onEnter;
    this.onExit = onExit;
  }

  process(atom, context) {
    if (this.onEnter) {
      this.onEnter(atom, context);
    }
    
    // This stage doesn't produce reductions itself
    // It wraps other stages
    return null;
  }
}

/**
 * Pipeline executor that chains stages
 */
export class ReductionPipeline {
  constructor(config = null) {
    this.stages = [];
    this.config = config;
    this.stats = {
      executions: 0,
      stageHits: new Map(),
      stageTimes: new Map()
    };
  }

  /**
   * Add a stage to the pipeline
   */
  use(stage) {
    this.stages.push(stage);
    return this;
  }

  /**
   * Remove a stage by name
   */
  remove(stageName) {
    this.stages = this.stages.filter(s => s.name !== stageName);
    return this;
  }

  /**
   * Enable/disable a stage
   */
  setStageEnabled(stageName, enabled) {
    const stage = this.stages.find(s => s.name === stageName);
    if (stage) {
      stage.enabled = enabled;
    }
    return this;
  }

  /**
   * Execute the pipeline
   */
  *execute(atom, context) {
    this.stats.executions++;
    const execStart = context?._metrics ? Date.now() : 0;

    for (const stage of this.stages) {
      try {
        const stageStart = Date.now();
        const result = stage.execute(atom, context);
        const stageTime = Date.now() - stageStart;

        if (result) {
          this._recordStageHit(stage.name, stageTime);

          // Special handling for certain result types
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
            yield { reduced: null, applied: true, deadEnd: true };
            return;
          }

          // Standard result
          if (result.applied) {
            yield result;
            return;
          }
        }
      } catch (error) {
        console.error(`Stage ${stage.name} error:`, error);
        // Continue to next stage on error
      }
    }

    // No stage applied
    yield { reduced: atom, applied: false };
  }

  /**
   * Execute with zipper for deep expressions
   */
  async *_executeWithZipper(atom, context) {
    const zipper = new Zipper(atom);
    
    // Navigate to deepest leaf
    while (zipper.down(0)) {}
    
    let anyReduced = false;
    do {
      const gen = this.execute(zipper.focus, context);
      for await (const res of gen) {
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

  /**
   * Execute grounded operation
   */
  async *_executeGrounded(atom, op, context) {
    const args = atom.components;
    
    if (context.ground?.isLazy(op)) {
      yield { reduced: context.ground.execute(op, ...args), applied: true };
      return;
    }
    
    // Reduce arguments first
    const variants = args.map(arg => 
      context.reduceND ? context.reduceND(arg, context.space, context.ground, context.limit) : [arg]
    );
    
    if (variants.some(v => v.length === 0)) return;
    
    for (const combo of this._cartesianProduct(variants)) {
      try {
        const res = context.ground.execute(op, ...combo);
        yield { reduced: res, applied: true };
        
        // Cache if pure
        if (context.config?.get('caching') && context.cache && context.ground?.isPure(op)) {
          context.cache.set(atom, res);
        }
      } catch (e) {
        console.error('Grounded op error:', e);
      }
    }
  }

  /**
   * Execute explicit grounded call
   */
  async *_executeExplicit(atom, op, args, context) {
    if (context.ground?.isLazy(op)) {
      yield { reduced: context.ground.execute(op, ...args), applied: true };
      return;
    }
    
    const variants = args.map(arg =>
      context.reduceND ? context.reduceND(arg, context.space, context.ground, context.limit) : [arg]
    );
    
    if (variants.some(v => v.length === 0)) return;
    
    for (const combo of this._cartesianProduct(variants)) {
      try {
        const res = context.ground.execute(op, ...combo);
        yield { reduced: res, applied: true };
      } catch (e) {
        console.error('Explicit call error:', e);
      }
    }
  }

  /**
   * Match rules
   */
  async *_matchRules(atom, rules, context) {
    for (const rule of rules) {
      if (!rule.pattern) continue;
      
      const bindings = context.Unify?.unify(rule.pattern, atom);
      if (bindings) {
        const reduced = typeof rule.result === 'function'
          ? rule.result(bindings)
          : context.Unify?.subst(rule.result, bindings);
        
        if (reduced !== undefined && reduced !== null) {
          yield { reduced, applied: true };
        }
      }
    }
  }

  /**
   * Execute superpose alternatives
   */
  async *_executeSuperpose(alternatives, context) {
    for (const alt of alternatives) {
      yield { reduced: alt, applied: true };
    }
  }

  /**
   * Generate Cartesian product
   */
  *_cartesianProduct(arrays) {
    if (arrays.length === 0) {
      yield [];
      return;
    }
    
    const [head, ...tail] = arrays;
    const tailProducts = tail.length ? this._cartesianProduct(tail) : [[]];
    
    for (const h of head) {
      for (const t of tailProducts) {
        yield [h, ...t];
      }
    }
  }

  /**
   * Record stage hit for statistics
   */
  _recordStageHit(stageName, duration = 0) {
    const count = this.stats.stageHits.get(stageName) || 0;
    const totalTime = this.stats.stageTimes.get(stageName) || 0;
    this.stats.stageHits.set(stageName, count + 1);
    this.stats.stageTimes.set(stageName, totalTime + duration);
  }

  /**
   * Get pipeline statistics
   */
  getStats() {
    const stageStats = {};
    for (const stage of this.stages) {
      const hits = this.stats.stageHits.get(stage.name) || 0;
      const time = this.stats.stageTimes.get(stage.name) || 0;
      stageStats[stage.name] = {
        hits,
        totalTime: time,
        avgTime: hits > 0 ? time / hits : 0,
        enabled: stage.enabled
      };
    }

    return {
      executions: this.stats.executions,
      stages: stageStats,
      stageCount: this.stages.length,
      enabledStages: this.stages.filter(s => s.enabled).map(s => s.name)
    };
  }

  /**
   * Get detailed performance profile
   */
  getProfile() {
    const stages = this.stages.map(stage => {
      const hits = this.stats.stageHits.get(stage.name) || 0;
      const time = this.stats.stageTimes.get(stage.name) || 0;
      return {
        name: stage.name,
        hits,
        totalTime: time,
        avgTime: hits > 0 ? time / hits : 0,
        enabled: stage.enabled,
        percentOfTotal: this.stats.executions > 0 
          ? (hits / this.stats.executions * 100).toFixed(2) + '%' 
          : '0%'
      };
    });

    // Sort by total time (slowest first)
    stages.sort((a, b) => b.totalTime - a.totalTime);

    return {
      totalExecutions: this.stats.executions,
      stages,
      bottleneck: stages[0]?.name || null
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats.executions = 0;
    this.stats.stageHits.clear();
    this.stats.stageTimes.clear();
  }

  /**
   * Create a standard pipeline with common stages
   */
  static createStandard(config, jitCompiler = null) {
    const pipeline = new ReductionPipeline(config);

    pipeline.use(new CacheStage());

    if (jitCompiler) {
      pipeline.use(new JITStage(jitCompiler));
    }

    pipeline.use(new SuperposeStage());
    pipeline.use(new ZipperStage(config?.get('zipperThreshold') || 8));
    pipeline.use(new GroundedOpStage());
    pipeline.use(new ExplicitCallStage());
    pipeline.use(new RuleMatchStage());

    return pipeline;
  }
}

/**
 * Fluent Pipeline Builder
 * @example
 * const pipeline = new PipelineBuilder()
 *   .withCache()
 *   .withJIT({ threshold: 50 })
 *   .withZipper({ threshold: 10 })
 *   .withRuleMatching()
 *   .build();
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
    const threshold = options.threshold || this.config?.get('jitThreshold') || 50;
    this.stages.push(new JITStage(new JITCompiler(threshold)));
    return this;
  }

  withZipper(options = {}) {
    const threshold = options.threshold || this.config?.get('zipperThreshold') || 8;
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
    for (const stage of this.stages) {
      pipeline.use(stage);
    }
    return pipeline;
  }
}
