/**
 * SeNARS RL Module - Unified Exports
 * General-purpose Reinforcement Learning with Neuro-Symbolic Integration
 *
 * Leverages:
 * - SeNARS core/: Reasoning, belief management, goal stacks
 * - MeTTa metta/: Policy representation, symbolic programs
 * - Tensor Logic tensor/: Differentiable learning, tensor operations
 */

// ==================== Core Abstractions ====================
export {
    Agent,
    Environment,
    DiscreteEnvironment,
    ContinuousEnvironment,
    Architecture,
    Grounding,
    SymbolicGrounding,
    LearnedGrounding
} from './core/RLCore.js';

// ==================== Component System ====================
export {
    Component,
    functionalComponent,
    EnhancedComponent,
    ComponentRegistry,
    globalRegistry,
    CompositionEngine,
    EnhancedCompositionEngine,
    ComposableUtils,
    PipelineBuilder
} from './composable/ComposableSystem.js';

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

// ==================== Neuro-Symbolic Systems ====================
export {
    WorldModel,
    SymbolicDifferentiation,
    NeuroSymbolicSystem
} from './systems/NeuroSymbolicSystem.js';

// ==================== Training ====================
export {
    TrainingLoop,
    TrainingConfig,
    EpisodeResult,
    TrainingPresets,
    WorkerPool,
    ParallelExecutor,
    DistributedTrainer,
    CheckpointManager,
    createCheckpointCallback
} from './training/TrainingSystem.js';

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
    makeEnv,
    GymWrapper,
    gym,
    isGymnasiumAvailable
} from './environments/EnvironmentSystem.js';

// ==================== Memory ====================
export {
    EpisodicMemory,
    SemanticMemory,
    MemorySystem,
    Memory,
    Knowledge,
    UnifiedMemory
} from './memory/MemorySystem.js';

// ==================== Experience ====================
export {
    ExperienceBuffer,
    CausalExperience,
    Experience,
    ExperienceStream,
    Episode,
    ExperienceIndex,
    ExperienceStore,
    SkillExtractor,
    ExperienceLearner
} from './experience/ExperienceBuffer.js';

// ==================== Planning & Modules ====================
export {
    PlanningSystem,
    IntrinsicMotivation
} from './modules/PlanningSystem.js';

// ==================== Cognitive Systems ====================
export { AttentionSystem, CognitiveSystem } from './systems/CognitiveSystem.js';
export { ReasoningSystem, CausalGraph, CausalNode, CausalEdge, CausalReasoner } from './systems/CognitiveSystem.js';

// ==================== Meta-Control ====================
export {
    MetaController,
    ModificationOperator,
    ArchitectureEvolver
} from './meta/MetaControlSystem.js';

// ==================== Skills ====================
export { Skill, SkillDiscovery } from './skills/SkillDiscovery.js';
export * from './skills/SkillManager.js';
export * from './skills/HierarchicalSkillSystem.js';

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
    Statistics,
    MetricsExporter,
    TrainingMonitor,
    createMonitor,
    createMonitorCallback
} from './evaluation/EvaluationSystem.js';

// ==================== Distributed Execution ====================
export * from './distributed/ParallelExecution.js';

// ==================== Configuration ====================
export * from './config/ConfigManager.js';

// ==================== Functional Utilities ====================
export * from './functional/FunctionalUtils.js';

// ==================== Cognitive Architectures ====================
export {
    RLCognitiveArchitecture,
    RLCognitiveArchitecture as CognitiveArchitecture,
    ArchitecturePresets
} from './systems/CognitiveArchitecture.js';
export { CognitiveModule } from './systems/modules/CognitiveModule.js';
export { PerceptionModule } from './systems/modules/PerceptionModule.js';
export { ReasoningModule } from './systems/modules/ReasoningModule.js';
export { PlanningModule } from './systems/modules/PlanningModule.js';
export { ActionModule } from './systems/modules/ActionModule.js';
export { MemoryModule } from './systems/modules/MemoryModule.js';
export { SkillModule } from './systems/modules/SkillModule.js';
export { MetaCognitiveModule } from './systems/modules/MetaCognitiveModule.js';
export { CognitiveModule } from './systems/modules/CognitiveModule.js';
export { PerceptionModule } from './systems/modules/PerceptionModule.js';
export { ReasoningModule } from './systems/modules/ReasoningModule.js';
export { PlanningModule } from './systems/modules/PlanningModule.js';
export { ActionModule } from './systems/modules/ActionModule.js';
export { MemoryModule } from './systems/modules/MemoryModule.js';
export { SkillModule } from './systems/modules/SkillModule.js';
export { MetaCognitiveModule } from './systems/modules/MetaCognitiveModule.js';
export * from './systems/EmergentArchitecture.js';

// ==================== Utilities ====================
export * from './utils/index.js';

// ==================== Tensor Logic Re-exports ====================
export {
    SymbolicTensor,
    TensorLogicBridge,
    symbolicTensor,
    termToTensor
} from '@senars/tensor';

// ==================== Interfaces ====================
/**
 * Formal interfaces for type checking and documentation.
 * Use JSDoc @implements tag to indicate implementation.
 * 
 * @example
 * ```javascript
 * import { IAgent } from '@senars/rl';
 * 
 * /**
 *  * @implements {IAgent}
 *  *\/
 * class MyAgent extends Component { ... }
 * ```
 */
export * from './interfaces/index.js';
