/**
 * Neuro-Symbolic Architecture - Re-exports
 * @deprecated Import from ArchitectureSystem.js directly
 */
export {
    ArchitectureConfig,
    NeuroSymbolicUnit,
    NeuroSymbolicLayer,
    ArchitectureBuilder,
    NeuroSymbolicArchitecture,
    ArchitectureFactory,
    EvolutionaryArchitecture,
    ArchitectureTemplates
} from './ArchitectureSystem.js';

// Specialized architectures
export { MeTTaPolicyArchitecture } from './MeTTaPolicyArchitecture.js';
export { DualProcessArchitecture } from './DualProcessArchitecture.js';
