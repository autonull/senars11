/**
 * Strategy Patterns - Re-exports
 * @deprecated Import from PluginStrategySystem.js directly
 */
export {
    Strategy,
    StrategyRegistry,
    ExplorationStrategy,
    EpsilonGreedy,
    BoltzmannExploration,
    Softmax,
    UCB,
    ThompsonSampling,
    OptimizationStrategy,
    SGD,
    Adam,
    RetrievalStrategy,
    SimilarityRetrieval,
    PriorityRetrieval,
    RecencyRetrieval,
    CEMPlanning,
    ConstantLR,
    StepDecayLR,
    CosineAnnealingLR,
    PotentialBasedShaping,
    IntrinsicShaping,
    RandomShooting,
    UniformReplay,
    PrioritizedReplay,
    composeStrategies,
    withRetry,
    withCaching,
    StrategyPresets
} from '../plugins/PluginStrategySystem.js';
