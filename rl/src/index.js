
// ==================== Core RL Components ====================
export * from './core/RLAgent.js';
export * from './core/RLEnvironment.js';
export * from './core/Architecture.js';
export * from './core/Grounding.js';
export * from './core/TensorPrimitives.js';

// ==================== Grounding & Memory ====================
export * from './grounding/LearnedGrounding.js';
export * from './memory/EpisodicMemory.js';

// ==================== Skills System ====================
export * from './skills/Skill.js';
export * from './skills/SkillManager.js';
export * from './skills/HierarchicalSkillSystem.js';
export * from './skills/HierarchicalSkillDiscovery.js';

// ==================== Policies ====================
export * from './policies/TensorLogicPolicy.js';

// ==================== Planning & Modules ====================
export * from './modules/Planner.js';
export * from './modules/HierarchicalPlanner.js';
export * from './modules/PathPlanner.js';
export * from './modules/RuleInducer.js';
export * from './modules/IntrinsicMotivation.js';

// ==================== Bridges ====================
export * from './bridges/SeNARSBridge.js';
export * from './bridges/NeuroSymbolicBridge.js';

// ==================== Architectures ====================
export * from './architectures/DualProcessArchitecture.js';
export * from './architectures/MeTTaPolicyArchitecture.js';
export * from './architectures/EvolutionaryArchitecture.js';

// ==================== Unified Architecture ====================
export * from './architecture/NeuroSymbolicArchitecture.js';

// ==================== Agents ====================
export * from './agents/NeuroSymbolicAgent.js';
export * from './agents/MeTTaAgent.js';
export * from './agents/RandomAgent.js';
export * from './agents/PolicyGradientAgent.js';
export * from './agents/ProgrammaticAgent.js';
export * from './agents/DQNAgent.js';
export * from './agents/PPOAgent.js';

// ==================== Environments ====================
export * from './environments/GridWorld.js';
export * from './environments/Continuous1D.js';
export * from './environments/CompositionalWorld.js';
export * from './environments/CartPole.js';
export * from './environments/UnifiedEnvironment.js';
export * from './environments/HybridActionSpace.js';

// ==================== Composable Module System ====================
export * from './composable/Component.js';
export * from './composable/ComponentRegistry.js';
export * from './composable/CompositionEngine.js';

// ==================== Meta-Controller ====================
export * from './meta/MetaController.js';

// ==================== Neuro-Symbolic Primitives ====================
export * from './neurosymbolic/TensorLogicBridge.js';
export * from './neurosymbolic/WorldModel.js';

// ==================== Attention Mechanisms ====================
export * from './attention/CrossModalAttention.js';

// ==================== Causal Reasoning ====================
export * from './reasoning/CausalReasoning.js';

// ==================== Plugin System ====================
export * from './plugins/PluginSystem.js';

// ==================== Strategy Patterns ====================
export * from './strategies/StrategyPatterns.js';

// ==================== Configuration ====================
export * from './config/ConfigManager.js';

// ==================== Functional Utilities ====================
export * from './functional/FunctionalUtils.js';

// ==================== Experience System ====================
export * from './experience/ExperienceSystem.js';
export * from './experience/DistributedExperienceBuffer.js';

// ==================== Cognitive Architecture ====================
export * from './cognitive/CognitiveArchitecture.js';
export * from './cognitive/EmergentArchitecture.js';

// ==================== SeNARS-MeTTa-Tensor Integration ====================
export * from './integration/SeNARSMettaTensor.js';

// ==================== Training Loop ====================
export * from './training/TrainingLoop.js';

// ==================== Distributed Execution ====================
export * from './distributed/ParallelExecution.js';

// ==================== Evaluation & Benchmarking ====================
export * from './evaluation/Benchmarking.js';
export * from './evaluation/NeuroSymbolicBenchmarking.js';
export * from './evaluation/StatisticalTests.js';

// ==================== Utilities (NEW - Deduplicated) ====================
export * from './utils/index.js';
export { ActionUtils, ModelFactory, StateUtils, LossUtils, BeliefSystem } from './utils/index.js';
