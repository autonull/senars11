import { NeuroSymbolicBridge } from '../bridges/NeuroSymbolicBridge.js';
import { TensorLogicPolicy } from '../policies/TensorLogicPolicy.js';

// Deprecated: Use NeuroSymbolicBridge
export class EnhancedSeNARSBridge extends NeuroSymbolicBridge {
    constructor(config = {}) {
        super({ ...config, useSeNARS: true });
    }
}

// Deprecated: Use TensorLogicPolicy
export class MeTTaPolicyNetwork extends TensorLogicPolicy {
    constructor(config = {}) {
        super({ ...config, policyType: 'metta' });
    }
}
