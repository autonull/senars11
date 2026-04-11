/**
 * Composable System - Unified Exports
 * Re-exports modular composable components
 */

// Core component
export {Component, functionalComponent} from './Component.js';

// Enhanced component (default export for convenience)
export {EnhancedComponent} from './EnhancedComponent.js';

// Composition engines
export {CompositionEngine, PipelineBuilder} from './CompositionEngine.js';
export {EnhancedCompositionEngine} from './EnhancedCompositionEngine.js';

// Composable patterns
export {
    BranchPattern,
    LoopPattern,
    ParallelPattern,
    ChainPattern,
    RetryPattern,
    TimeoutPattern,
    Patterns
} from './ComposablePatterns.js';

// Registry
export {ComponentRegistry, globalRegistry} from './ComponentRegistry.js';
