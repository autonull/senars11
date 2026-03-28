import { step, stepYield, setReduceNDInternalReference, setReduceDeterministicInternalReference } from './StepFunctions.js';
import { reduce, reduceAsync, setInternalReferences as setDetReferences } from './DeterministicReduction.js';
import { reduceND, reduceNDAsync, setNDInternalReferences, setDeterministicInternalReference as setNDDetReference } from './NonDeterministicReduction.js';

// Wire up dependencies
setDetReferences(step, stepYield);
setNDInternalReferences(stepYield);
setReduceNDInternalReference(reduceND);
setReduceDeterministicInternalReference(reduce);
setNDDetReference(reduce);

export * from './StepFunctions.js';
export * from './DeterministicReduction.js';
export * from './NonDeterministicReduction.js';
