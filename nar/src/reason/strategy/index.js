/**
 * @file index.js
 * @description Exports for premise formation strategies.
 */

export { PremiseFormationStrategy } from './PremiseFormationStrategy.js';
export { DecompositionStrategy } from './DecompositionStrategy.js';
export { TermLinkStrategy } from './TermLinkStrategy.js';
export { TaskMatchStrategy } from './TaskMatchStrategy.js';

// Re-export existing strategies
export { BagStrategy } from './BagStrategy.js';
export { ExhaustiveStrategy } from './ExhaustiveStrategy.js';
export { ResolutionStrategy } from './ResolutionStrategy.js';
export { NarsGPTStrategy } from './NarsGPTStrategy.js';
export { AnalogicalStrategy } from './AnalogicalStrategy.js';
export { GoalDrivenStrategy } from './GoalDrivenStrategy.js';
export { SemanticStrategy } from './SemanticStrategy.js';
export { DefaultFormationStrategy } from './DefaultFormationStrategy.js';

// Note: PrologStrategy and MeTTaStrategy are now consolidated in metta/src/nal/
// Import from: import {PrologStrategy, MeTTaStrategy} from '../../metta/src/nal/index.js';
export { PrologStrategy } from './PrologStrategy.js';
