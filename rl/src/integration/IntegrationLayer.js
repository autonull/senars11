/**
 * Integration Layer - Re-exports
 * @deprecated Import from specific modules directly
 */
export {
    NeuroSymbolicBridge, NeuroSymbolicBridge as EnhancedBridge, NeuroSymbolicBridge as UnifiedBridge
} from '../bridges/NeuroSymbolicBridge.js';
export {SeNARSBridge} from '../bridges/SeNARSBridge.js';

// Specialized integration utilities
export {UnifiedNeuroSymbolicAgent, UnifiedAgentFactory} from './SeNARSMettaTensor.js';
