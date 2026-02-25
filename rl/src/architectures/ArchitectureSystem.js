/**
 * Unified Architecture System
 * Re-exports modular architecture components
 * 
 * @module @senars/rl/architectures
 */

// Core architecture classes
export { NeuroSymbolicArchitecture, NeuroSymbolicArchitecture as Architecture } from './NeuroSymbolicArchitecture.js';
export { NeuroSymbolicUnit } from './NeuroSymbolicUnit.js';
export { NeuroSymbolicLayer } from './NeuroSymbolicLayer.js';

// Builder and factory
export { ArchitectureBuilder } from './ArchitectureBuilder.js';
export { ArchitectureFactory, Architectures } from './ArchitectureFactory.js';

// Configuration
export { ArchitectureConfig, ArchitectureTemplates } from './ArchitectureConfig.js';
export { LAYER_DEFAULTS, UNIT_DEFAULTS, LAYER_CONFIG_DEFAULTS } from './ArchitectureConfig.js';

// Evolutionary
export { EvolutionaryArchitecture } from './EvolutionaryArchitecture.js';
