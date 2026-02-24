/**
 * Unified Environment Adapter - Re-exports
 * @deprecated Import from EnvironmentSystem.js directly
 */
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
} from './EnvironmentSystem.js';

// Additional unified environment utilities
export { UnifiedEnvironment } from './UnifiedEnvironment.js';
export { HybridActionSpace } from './HybridActionSpace.js';
export { GridWorld } from './GridWorld.js';
export { CartPole } from './CartPole.js';
export { Continuous1D } from './Continuous1D.js';
export { CompositionalWorld } from './CompositionalWorld.js';
