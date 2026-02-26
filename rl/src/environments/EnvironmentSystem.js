/**
 * Environment System - Unified Exports
 * Re-exports modular environment components
 */

// Space definitions
export { ActionSpace } from './ActionSpace.js';
export { ObservationSpace } from './ObservationSpace.js';

// Wrappers
export {
    EnvironmentWrapper,
    NormalizeObservationWrapper,
    ClipActionWrapper,
    TimeLimitWrapper,
    RewardScaleWrapper,
    FrameStackWrapper,
    DiscreteToContinuousWrapper,
    ContinuousToDiscreteWrapper
} from './EnvironmentWrappers.js';

// Factory and registry
export {
    EnhancedEnvironment,
    EnvironmentFactory,
    EnvironmentRegistry,
    globalEnvRegistry,
    wrapEnv,
    makeEnv
} from './EnvironmentFactory.js';

// Gymnasium compatibility
export { GymWrapper, gym, isGymnasiumAvailable } from './GymnasiumWrapper.js';
