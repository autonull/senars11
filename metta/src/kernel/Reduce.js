/**
 * Reduce.js - High-Performance Reduction Engine
 * 
 * Architecture:
 * - Per-interpreter pipelines for isolation and customization
 * - Context pooling to reduce GC pressure
 * - Lazy stage evaluation with early exit
 * - Built-in metrics and profiling
 * - Fluent pipeline builder API
 */

import { ReductionPipeline, CacheStage, JITStage, ZipperStage,
         GroundedOpStage, ExplicitCallStage, RuleMatchStage, SuperposeStage } from './reduction/ReductionPipeline.js';
import { JITCompiler } from './reduction/JITCompiler.js';
import { configManager } from '../config/config.js';
import { Unify } from './Unify.js';

// ===== Context Pool (reduces GC pressure) =====
const contextPool = [];
const CONTEXT_POOL_SIZE = 100;

function acquireContext(space, ground, limit, cache, reduceND, interpreter = null) {
  const ctx = contextPool.pop() || {};
  ctx.config = configManager;
  ctx.space = space;
  ctx.ground = ground;
  ctx.limit = limit;
  ctx.steps = 0;
  ctx.cache = cache;
  ctx.Unify = Unify;
  ctx.reduceND = reduceND;
  ctx.interpreter = interpreter;
  ctx._metrics = { stages: new Map(), startTime: Date.now() };
  return ctx;
}

function releaseContext(ctx) {
  if (contextPool.length < CONTEXT_POOL_SIZE) {
    ctx._metrics.stages.clear();
    ctx.steps = 0;
    contextPool.push(ctx);
  }
}

// ===== Pipeline Registry (per-interpreter) =====
const pipelineRegistry = new WeakMap();

function getOrCreatePipeline(interpreter, customStages = null) {
  if (customStages) {
    // Custom pipeline for this interpreter
    const pipeline = new ReductionPipeline(configManager);
    for (const stage of customStages) {
      pipeline.use(stage);
    }
    pipelineRegistry.set(interpreter, pipeline);
    return pipeline;
  }

  // Check for existing pipeline
  let pipeline = pipelineRegistry.get(interpreter);
  if (!pipeline) {
    const jitCompiler = new JITCompiler(configManager.get('jitThreshold'));
    pipeline = ReductionPipeline.createStandard(configManager, jitCompiler);
    pipelineRegistry.set(interpreter, pipeline);
  }
  return pipeline;
}

// ===== Global fallback (for standalone usage) =====
let globalPipeline = null;
let globalReduceND = null;

function getGlobalPipeline() {
  if (!globalPipeline) {
    const jitCompiler = new JITCompiler(configManager.get('jitThreshold'));
    globalPipeline = ReductionPipeline.createStandard(configManager, jitCompiler);
  }
  return globalPipeline;
}

/**
 * Reset the global pipeline (useful for testing or config changes)
 */
export function resetGlobalPipeline() {
  globalPipeline = null;
  globalReduceND = null;
}

// ===== Core Reduction Functions =====

/**
 * Create reduction options object (ergonomic API)
 * @returns {Object} Options builder
 */
export function reductionOptions() {
  return {
    limit: 10000,
    cache: null,
    space: null,
    ground: null,
    withCache(cache) { this.cache = cache; return this; },
    withSpace(space) { this.space = space; return this; },
    withGround(ground) { this.ground = ground; return this; },
    withLimit(limit) { this.limit = limit; return this; },
    build() { return { ...this }; }
  };
}

/**
 * Single-step reduction
 * @param {Atom} atom - Atom to reduce
 * @param {Space} space - Knowledge space
 * @param {Ground} ground - Grounded operations
 * @param {number} limit - Step limit
 * @param {ReductionCache} cache - Result cache
 * @returns {Object} { reduced, applied, deadEnd? }
 */
export function step(atom, space, ground, limit = 10000, cache = null, interpreter = null) {
  const ctx = acquireContext(space, ground, limit, cache, globalReduceND, interpreter);
  try {
    const pl = getGlobalPipeline();
    const gen = pl.execute(atom, ctx);
    const { value, done } = gen.next();

    if (!done && value) {
      return value.deadEnd
        ? { reduced: { operator: atom.operator || atom, components: [] }, applied: true, deadEnd: true }
        : value;
    }
    return { reduced: atom, applied: false };
  } finally {
    releaseContext(ctx);
  }
}

/**
 * Generator-based step yield (for advanced usage)
 */
export function* stepYield(atom, space, ground, limit = 10000, cache = null) {
  const ctx = acquireContext(space, ground, limit, cache, globalReduceND);
  try {
    const pl = getGlobalPipeline();
    yield* pl.execute(atom, ctx);
  } finally {
    releaseContext(ctx);
  }
}

/**
 * Deterministic reduction (single result)
 * @param {Atom} atom - Atom to reduce
 * @param {Space} space - Knowledge space
 * @param {Ground} ground - Grounded operations
 * @param {number} limit - Step limit
 * @param {ReductionCache} cache - Result cache
 * @returns {Atom} Reduced atom
 */
export function reduce(atom, space, ground, limit = 10000, cache = null, interpreter = null) {
  const ctx = acquireContext(space, ground, limit, cache, globalReduceND, interpreter);
  try {
    const pl = getGlobalPipeline();
    let current = atom;

    while (ctx.steps < limit) {
      const gen = pl.execute(current, ctx);
      const { value, done } = gen.next();

      if (done || !value?.applied) {
        return current;
      }

      current = value.reduced;
      ctx.steps++;
    }

    if (ctx.steps >= limit) {
        throw new Error(`Max steps exceeded: ${limit} steps`);
    }
    return current;
  } finally {
    releaseContext(ctx);
  }
}

/**
 * Non-deterministic reduction (all results)
 * @param {Atom} atom - Atom to reduce
 * @param {Space} space - Knowledge space
 * @param {Ground} ground - Grounded operations
 * @param {number} limit - Step limit
 * @param {ReductionCache} cache - Result cache
 * @returns {Atom[]} All possible results
 */
export function reduceND(atom, space, ground, limit = 10000, cache = null, interpreter = null) {
  const ctx = acquireContext(space, ground, limit, cache, globalReduceND, interpreter);
  try {
    const results = [];
    const pl = getGlobalPipeline();
    let steps = 0;

    // Initial reduction pass
    const initialResults = [];
    for (const result of pl.execute(atom, ctx)) {
      if (result.applied) {
        if (result.deadEnd) {
          // Special case: dead end (e.g., superpose empty) - return no results
          return [];
        }
        initialResults.push(result.reduced);
      }
    }

    // Recursively reduce each result to normal form
    for (const initial of initialResults) {
      let current = initial;
      let reduced = true;
      
      while (reduced && steps < limit) {
        reduced = false;
        for (const result of pl.execute(current, ctx)) {
          if (result.applied && !result.deadEnd) {
            current = result.reduced;
            reduced = true;
            steps++;
            break; // Start over with new current
          }
        }
      }
      
      results.push(current);
    }

    return results.length > 0 ? results : [atom];
  } finally {
    releaseContext(ctx);
  }
}

/**
 * Non-deterministic reduction generator (yields results one at a time)
 * @param {Atom} atom - Atom to reduce
 * @param {Space} space - Knowledge space
 * @param {Ground} ground - Grounded operations
 * @param {number} limit - Step limit
 * @param {ReductionCache} cache - Result cache
 * @yields {Atom} Each reduced result
 */
export function* reduceNDGenerator(atom, space, ground, limit = 10000, cache = null) {
  const ctx = acquireContext(space, ground, limit, cache, globalReduceND);
  try {
    const pl = getGlobalPipeline();

    for (const result of pl.execute(atom, ctx)) {
      if (result.applied) {
        yield result.reduced;
      }
    }
  } finally {
    releaseContext(ctx);
  }
}

/**
 * Async reduction (for browser/worker environments)
 */
export async function reduceAsync(atom, space, ground, limit, cache) {
  // Yield to event loop periodically to avoid blocking
  const ctx = acquireContext(space, ground, limit, cache, globalReduceND);
  try {
    const pl = getGlobalPipeline();
    let current = atom;
    let steps = 0;
    const yieldInterval = 100; // Yield every N steps

    while (steps < limit) {
      if (steps % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const gen = pl.execute(current, ctx);
      const { value, done } = gen.next();

      if (done || !value?.applied) {
        return current;
      }

      current = value.reduced;
      steps++;
    }

    throw new Error(`Max steps exceeded: ${limit} steps`);
  } finally {
    releaseContext(ctx);
  }
}

/**
 * Async non-deterministic reduction
 */
export async function reduceNDAsync(atom, space, ground, limit, cache) {
  const ctx = acquireContext(space, ground, limit, cache, globalReduceND);
  try {
    const results = [];
    const pl = getGlobalPipeline();
    const yieldInterval = 100;
    let stepCount = 0;

    for (const result of pl.execute(atom, ctx)) {
      if (++stepCount % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (result.applied) {
        results.push(result.reduced);
      }
    }

    return results.length > 0 ? results : [atom];
  } finally {
    releaseContext(ctx);
  }
}

/**
 * Async step
 */
export async function stepAsync(atom, space, ground, limit, cache) {
  await new Promise(resolve => setTimeout(resolve, 0));
  return step(atom, space, ground, limit, cache);
}

/**
 * Pattern matching
 */
export function match(space, pattern, template) {
  const res = [];
  for (const cand of space.all()) {
    const bind = Unify.unify(pattern, cand);
    if (bind) res.push(Unify.subst(template, bind));
  }
  return res;
}

/**
 * Check if an expression is a grounded call
 * @param {*} atom - The atom to check
 * @param {Ground} ground - Ground instance
 * @returns {boolean} True if it's a grounded call
 */
export function isGroundedCall(atom, ground) {
  if (!atom || typeof atom !== 'object' || !atom.type || atom.type !== 'compound') {
    return false;
  }
  
  // Check if it's a ^ expression (grounded call wrapper)
  const operator = atom.operator;
  if (!operator || operator.name !== '^') {
    return false;
  }
  
  // Check if the first argument is a grounded operation
  const components = atom.components;
  if (!components || components.length < 2) {
    return false;
  }
  
  const opSymbol = components[0];
  if (!opSymbol || !opSymbol.name) {
    return false;
  }
  
  return ground.has(opSymbol.name);
}

// ===== Interpreter Integration =====

/**
 * Create reduction bindings for an interpreter
 * This allows each interpreter to have its own pipeline
 */
export function createInterpreterBindings(interpreter, customStages = null) {
  const pipeline = getOrCreatePipeline(interpreter, customStages);
  let reduceND = null;

  return {
    /**
     * Set the reduceND reference (circular dependency)
     */
    setReduceND(fn) {
      reduceND = fn;
      return this;
    },

    /**
     * Step with interpreter's pipeline
     */
    step(atom, space, ground, limit, cache) {
      const ctx = acquireContext(space, ground, limit, cache, reduceND);
      try {
        const gen = pipeline.execute(atom, ctx);
        const { value, done } = gen.next();
        if (!done) {
          return value.deadEnd
            ? { reduced: { operator: atom.operator || atom, components: [] }, applied: true, deadEnd: true }
            : value;
        }
        return { reduced: atom, applied: false };
      } finally {
        releaseContext(ctx);
      }
    },

    /**
     * Reduce with interpreter's pipeline
     */
    reduce(atom, space, ground, limit, cache) {
      const ctx = acquireContext(space, ground, limit, cache, reduceND);
      try {
        let current = atom;
        let steps = 0;

        while (steps < limit) {
          const gen = pipeline.execute(current, ctx);
          const { value, done } = gen.next();

          if (done || !value?.applied) {
            return current;
          }

          current = value.reduced;
          steps++;
        }

        throw new Error(`Max steps exceeded: ${limit} steps`);
      } finally {
        releaseContext(ctx);
      }
    },

    /**
     * Non-deterministic reduce with interpreter's pipeline
     */
    reduceND(atom, space, ground, limit, cache) {
      const ctx = acquireContext(space, ground, limit, cache, reduceND);
      try {
        const results = [];
        for (const result of pipeline.execute(atom, ctx)) {
          if (result.applied) {
            results.push(result.reduced);
          }
        }
        return results.length > 0 ? results : [atom];
      } finally {
        releaseContext(ctx);
      }
    },

    /**
     * Get pipeline statistics
     */
    getStats() {
      return pipeline.getStats();
    },

    /**
     * Enable/disable a stage at runtime
     */
    setStageEnabled(stageName, enabled) {
      pipeline.setStageEnabled(stageName, enabled);
      return this;
    },

    /**
     * Add a custom stage
     */
    addStage(stage) {
      pipeline.use(stage);
      return this;
    }
  };
}

// ===== Legacy Compatibility (will be removed) =====

export function setInternalReferences(stepFn, stepYieldFn) {
  // No-op in new architecture
}

export function setNDInternalReferences(stepYieldFn) {
  // No-op in new architecture
}

export function setReduceNDInternalReference(ndReduceFn) {
  globalReduceND = ndReduceFn;
}

export function setReduceDeterministicInternalReference(detReduceFn) {
  // No-op in new architecture
}

export function setDeterministicInternalReference(detReduceFn) {
  // No-op in new architecture
}

// ===== Exports =====

export { ReductionPipeline, CacheStage, JITStage, ZipperStage,
         GroundedOpStage, ExplicitCallStage, RuleMatchStage, SuperposeStage };

// Export for advanced usage
export { contextPool, pipelineRegistry, getGlobalPipeline };
