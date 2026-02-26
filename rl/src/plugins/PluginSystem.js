/**
 * Plugin System - Re-exports
 * @deprecated Import from PluginStrategySystem.js directly
 */
export {
    Plugin,
    PluginManager,
    PluginManager as PluginSystem,
    Strategy,
    StrategyRegistry,
    ExplorationStrategy,
    EpsilonGreedy,
    BoltzmannExploration,
    UCB,
    ThompsonSampling
} from './PluginStrategySystem.js';
