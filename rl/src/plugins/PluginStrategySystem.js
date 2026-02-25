/**
 * Plugin and Strategy System - Unified Exports
 * Re-exports modular plugin and strategy components
 */

// Plugin
export { Plugin } from './Plugin.js';

// Plugin Manager
export { PluginManager } from './PluginManager.js';

// Strategies
export {
    Strategy,
    EpsilonGreedy,
    BoltzmannExploration,
    UCB,
    ThompsonSampling,
    Strategies,
    createStrategy
} from './Strategy.js';

// Convenience re-exports
export const Explore = {
    epsilonGreedy: (config) => new EpsilonGreedy(config),
    boltzmann: (config) => new BoltzmannExploration(config),
    ucb: (config) => new UCB(config),
    thompson: (config) => new ThompsonSampling(config)
};
