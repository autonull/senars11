/**
 * SeNARS RL Module - Unified Exports
 * General-purpose Reinforcement Learning with Neuro-Symbolic Integration
 *
 * Leverages:
 * - SeNARS core/: Reasoning, belief management, goal stacks
 * - MeTTa metta/: Policy representation, symbolic programs
 * - Tensor Logic tensor/: Differentiable learning, tensor operations
 */

// ==================== Core RL Abstractions ====================
export {
    Agent,
    Environment,
    DiscreteEnvironment,
    ContinuousEnvironment,
    Architecture,
    Grounding,
    SymbolicGrounding,
    LearnedGrounding
} from './core/RL.js';

// ==================== Neuro-Symbolic Bridges ====================
export { NeuroSymbolicBridge } from './bridges/NeuroSymbolicBridge.js';
export { SeNARSBridge } from './bridges/SeNARSBridge.js';

// ==================== Policies ====================
export { TensorLogicPolicy } from './policies/TensorLogicPolicy.js';
export {
    PolicyNetwork,
    AttentionPolicy,
    EnsemblePolicy,
    Policy,
    Network
} from './policies/PolicySystem.js';

// ==================== Neuro-Symbolic Systems ====================
export {
    WorldModel,
    SymbolicDifferentiation,
    NeuroSymbolicSystem,
    Model,
    SymbolicGrad,
    NeuroSymbolic
} from './neurosymbolic/NeuroSymbolicSystem.js';

// ==================== Composable Systems ====================
export {
    Component,
    functionalComponent
} from './composable/Component.js';

export {
    ComponentRegistry,
    EnhancedComponent,
    EnhancedCompositionEngine,
    ComposableUtils,
    CompositionEngine
} from './composable/ComposableSystem.js';

// ==================== Training Systems ====================
export {
    TrainingLoop,
    TrainingConfig,
    EpisodeResult,
    TrainingPresets,
    WorkerPool,
    ParallelExecutor,
    DistributedTrainer
} from './training/TrainingSystem.js';

// ==================== Agents ====================
export {
    NeuralAgent,
    DQNAgent,
    PPOAgent,
    PolicyGradientAgent,
    RandomAgent,
    AgentBuilder,
    AgentFactoryUtils
} from './agents/AgentSystem.js';

// ==================== Architectures ====================
export {
    NeuroSymbolicArchitecture,
    ArchitectureConfig,
    ArchitectureBuilder,
    NeuroSymbolicUnit,
    NeuroSymbolicLayer,
    ArchitectureTemplates,
    ArchitectureFactory,
    EvolutionaryArchitecture
} from './architectures/ArchitectureSystem.js';

// ==================== Planning & Modules ====================
export {
    PlanningSystem,
    Planner,
    HierarchicalPlanner,
    PathPlanner,
    RuleInducer,
    IntrinsicMotivation
} from './modules/PlanningSystem.js';

// ==================== Cognitive Systems ====================
export { AttentionSystem, CognitiveSystem } from './cognitive/CognitiveSystem.js';
export { ReasoningSystem, CausalGraph, CausalNode, CausalEdge } from './cognitive/CognitiveSystem.js';

// ==================== Meta-Control ====================
export {
    MetaController,
    ModificationOperator,
    ArchitectureEvolver,
    SelfModifier,
    ArchitectureSearch,
    Evolver
} from './meta/MetaControlSystem.js';

// ==================== Environments ====================
export {
    ActionSpace,
    ObservationSpace,
    EnvironmentWrapper,
    NormalizeObservationWrapper,
    ClipActionWrapper,
    TimeLimitWrapper,
    RewardScaleWrapper,
    FrameStackWrapper,
    DiscreteToContinuousWrapper,
    ContinuousToDiscreteWrapper,
    EnhancedEnvironment,
    EnvironmentFactory,
    EnvironmentRegistry,
    globalEnvRegistry,
    wrapEnv,
    makeEnv
} from './environments/EnvironmentSystem.js';

// ==================== Evaluation ====================
export {
    BenchmarkRunner,
    MetricsCollector,
    StatisticalTests,
    AgentComparator,
    PowerAnalysis,
    MultipleComparisonCorrection,
    Evaluator,
    Collector,
    Statistics
} from './evaluation/EvaluationSystem.js';

// ==================== Memory Systems ====================
export {
    EpisodicMemory,
    SemanticMemory,
    MemorySystem,
    Memory,
    Knowledge,
    UnifiedMemory
} from './memory/MemorySystem.js';

// ==================== Plugins & Strategies ====================
export {
    Plugin,
    PluginManager,
    Strategy,
    StrategyRegistry,
    ExplorationStrategy,
    EpsilonGreedy,
    BoltzmannExploration,
    UCB,
    ThompsonSampling,
    PluginSystem,
    StrategySystem,
    Explore
} from './plugins/PluginStrategySystem.js';

// ==================== Configuration ====================
export * from './config/ConfigManager.js';

// ==================== Functional Utilities ====================
export * from './functional/FunctionalUtils.js';

// ==================== Cognitive Architectures ====================
export * from './cognitive/CognitiveArchitecture.js';
export * from './cognitive/EmergentArchitecture.js';

// ==================== Skills ====================
export * from './skills/SkillManager.js';
export * from './skills/HierarchicalSkillSystem.js';
export { Skill, SkillDiscovery } from './skills/SkillDiscovery.js';

// ==================== Distributed Execution ====================
export * from './distributed/ParallelExecution.js';

// ==================== Tensor Logic Re-exports ====================
export {
    SymbolicTensor,
    TensorLogicBridge,
    symbolicTensor,
    termToTensor
} from '@senars/tensor';

// ==================== All Utilities ====================
export * from './utils/index.js';
