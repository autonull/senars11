/**
 * Plugin and Strategy System - Unified Exports
 * Re-exports modular plugin and strategy components
 */

// Plugin
export {Plugin} from './Plugin.js';

// Plugin Manager
export {PluginManager} from './PluginManager.js';

// Strategies
export {
    Strategy,
    Strategy as ExplorationStrategy, // Alias
    EpsilonGreedy,
    BoltzmannExploration,
    BoltzmannExploration as Softmax, // Alias
    UCB,
    ThompsonSampling,
    Strategies,
    createStrategy
} from './Strategy.js';

// Advanced Strategies
export {
    ConstantLR,
    StepDecayLR,
    CosineAnnealingLR,
    OptimizationStrategy,
    SGD,
    Adam,
    PotentialBasedShaping,
    IntrinsicShaping,
    RandomShooting,
    CEMPlanning,
    RetrievalStrategy,
    UniformReplay,
    PrioritizedReplay,
    SimilarityRetrieval,
    PriorityRetrieval,
    RecencyRetrieval,
    composeStrategies,
    withRetry,
    withCaching,
    StrategyRegistry,
    StrategyPresets
} from './AdvancedStrategies.js';

// Convenience re-exports
export const Explore = {
    epsilonGreedy: (config) => new EpsilonGreedy(config),
    boltzmann: (config) => new BoltzmannExploration(config),
    ucb: (config) => new UCB(config),
    thompson: (config) => new ThompsonSampling(config)
};
