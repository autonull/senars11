/**
 * kernel/reduction/index.js - Export module for reduction modules
 */

import { step as stepFunc, stepYield as stepYieldFunc, setReduceNDInternalReference } from './StepFunctions.js';
import { setInternalReferences as setDetRefs, reduce as detReduce } from './DeterministicReduction.js';
import { setNDInternalReferences as setNDRefs, reduceNDInternal as reduceNDInternalFunc, setDeterministicInternalReference } from './NonDeterministicReduction.js';
import { match as matchFunc } from './StepFunctions.js';

// Set up internal references to connect the modules
setDetRefs(stepFunc, stepYieldFunc);
setNDRefs(stepYieldFunc);

// Set the deterministic internal reference in ND module
setDeterministicInternalReference(detReduce);

// Set the non-deterministic internal reference in StepFunctions module
setReduceNDInternalReference(reduceNDInternalFunc);

export { stepYield, step, executeGroundedOpND, executeGroundedOpWithArgsND, isGroundedCall, match } from './StepFunctions.js';
export { reduce, reduceAsync } from './DeterministicReduction.js';
export { reduceND, reduceNDAsync, reduceNDGenerator } from './NonDeterministicReduction.js';
