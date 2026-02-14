/**
 * Reduce.js - Evaluation Engine
 * Core single-step rewriting and full reduction logic.
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized, Deeply deduplicated
 *
 * This file now serves as a compatibility layer that exports the modular reduction functions.
 */

// Import all reduction functions from the new modular structure
export {
    stepYield,
    step,
    executeGroundedOpND,
    executeGroundedOpWithArgsND,
    reduce,
    reduceND,
    reduceNDGenerator,
    reduceAsync,
    reduceNDAsync,
    isGroundedCall,
    match
} from './reduction/index.js';
