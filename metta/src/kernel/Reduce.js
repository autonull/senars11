/**
 * Reduce.js - Main reduction entry point
 * Uses ReductionPipeline for modular, stage-based reduction
 */

import { ReductionPipeline, CacheStage, JITStage, ZipperStage, 
         GroundedOpStage, ExplicitCallStage, RuleMatchStage, SuperposeStage } from './reduction/ReductionPipeline.js';
import { JITCompiler } from './reduction/JITCompiler.js';
import { configManager } from '../config/config.js';
import { Unify } from './Unify.js';

// Global pipeline instance (created on first use)
let pipeline = null;
let jitCompiler = null;
let _reduceND = null; // Internal reference for circular dep

/**
 * Get or create the reduction pipeline
 */
function getPipeline() {
  if (!pipeline) {
    jitCompiler = new JITCompiler(configManager.get('jitThreshold'));
    pipeline = ReductionPipeline.createStandard(configManager, jitCompiler);
  }
  return pipeline;
}

/**
 * Create reduction context
 */
function createContext(space, ground, limit, cache) {
  return {
    config: configManager,
    space,
    ground,
    cache,
    limit,
    Unify,
    reduceND: _reduceND
  };
}

/**
 * Single-step reduction using the pipeline
 */
export function step(atom, space, ground, limit, cache) {
  const ctx = createContext(space, ground, limit, cache);
  const gen = stepYield(atom, space, ground, limit, cache);
  const { value, done } = gen.next();
  
  if (!done) {
    return value.deadEnd
      ? { reduced: { operator: atom.operator || atom, components: [] }, applied: true }
      : value;
  }
  return { reduced: atom, applied: false };
}

/**
 * Generator-based step yield using pipeline
 */
export function* stepYield(atom, space, ground, limit = 10000, cache = null) {
  const ctx = createContext(space, ground, limit, cache);
  const pl = getPipeline();
  yield* pl.execute(atom, ctx);
}

/**
 * Deterministic reduction
 */
export function reduce(atom, space, ground, limit, cache) {
  const ctx = createContext(space, ground, limit, cache);
  const pl = getPipeline();
  
  let current = atom;
  let steps = 0;

  while (steps < limit) {
    const gen = pl.execute(current, ctx);
    const { value, done } = gen.next();
    
    if (done || !value?.applied) {
      return current;
    }

    current = value.reduced;
    steps++;
  }

  throw new Error(`Reduction limit exceeded: ${limit} steps`);
}

/**
 * Non-deterministic reduction (returns all results)
 */
export function reduceND(atom, space, ground, limit, cache) {
  const ctx = createContext(space, ground, limit, cache);
  const results = [];
  const pl = getPipeline();

  for (const result of pl.execute(atom, ctx)) {
    if (result.applied) {
      results.push(result.reduced);
    }
  }

  return results.length > 0 ? results : [atom];
}

/**
 * Async variants
 */
export async function reduceAsync(atom, space, ground, limit, cache) {
  return reduce(atom, space, ground, limit, cache);
}

export async function reduceNDAsync(atom, space, ground, limit, cache) {
  return reduceND(atom, space, ground, limit, cache);
}

export async function stepAsync(atom, space, ground, limit, cache) {
  return step(atom, space, ground, limit, cache);
}

/**
 * Match atoms in space against a pattern
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
 * Circular dependency resolution - set reduceND reference
 */
export function setInternalReferences(stepFn, stepYieldFn) {
  // Pipeline handles this internally now
}

export function setNDInternalReferences(stepYieldFn) {
  // Pipeline handles this internally now  
}

export function setReduceNDInternalReference(ndReduceFn) {
  _reduceND = ndReduceFn;
}

export function setReduceDeterministicInternalReference(detReduceFn) {
  // Not needed with pipeline architecture
}

export function setDeterministicInternalReference(detReduceFn) {
  // Not needed with pipeline architecture
}

// Re-export pipeline components for direct access
export { ReductionPipeline, CacheStage, JITStage, ZipperStage, 
         GroundedOpStage, ExplicitCallStage, RuleMatchStage, SuperposeStage };
