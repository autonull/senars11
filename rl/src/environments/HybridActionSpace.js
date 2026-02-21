/**
 * Hybrid Action Space System
 * True simultaneous control of both continuous and discrete actions.
 * For environments requiring mixed action types (e.g., discrete grip + continuous movement).
 */

/**
 * Hybrid Action Space
 * Combines discrete and continuous action components into unified space.
 */
export class HybridActionSpace {
    constructor(spec = {}) {
        this.type = 'Hybrid';
        
        // Discrete components
        this.discrete = spec.discrete ?? {};
        // e.g., { grip: { n: 2 }, tool: { n: 4 } }
        
        // Continuous components  
        this.continuous = spec.continuous ?? {};
        // e.g., { joint1: { low: -1, high: 1 }, joint2: { low: -1, high: 1 } }
        
        // Compute total dimensions
        this.discreteCount = Object.keys(this.discrete).length;
        this.continuousCount = Object.keys(this.continuous).length;
        this.continuousDim = this._computeContinuousDim();
    }

    _computeContinuousDim() {
        let dim = 0;
        for (const spec of Object.values(this.continuous)) {
            dim += spec.shape?.reduce((a, b) => a * b, 1) ?? 1;
        }
        return dim;
    }

    /**
     * Sample from hybrid space
     */
    sample() {
        const action = {};
        
        // Sample discrete components
        for (const [name, spec] of Object.entries(this.discrete)) {
            action[name] = Math.floor(Math.random() * spec.n);
        }

        // Sample continuous components
        for (const [name, spec] of Object.entries(this.continuous)) {
            const low = spec.low ?? -1;
            const high = spec.high ?? 1;
            const shape = spec.shape ?? [1];
            const size = shape.reduce((a, b) => a * b, 1);

            if (Array.isArray(low)) {
                action[name] = low.map((l, i) => {
                    const h = Array.isArray(high) ? high[i] : high;
                    return l + Math.random() * (h - l);
                });
            } else {
                action[name] = Array.from({ length: size }, () =>
                    low + Math.random() * (high - low)
                );
            }

            // Only unwrap if shape is [1] (single value)
            if (shape.length === 1 && shape[0] === 1 && Array.isArray(action[name])) {
                action[name] = action[name][0];
            }
        }

        return action;
    }

    /**
     * Check if action is valid
     */
    contains(action) {
        if (!action || typeof action !== 'object') return false;
        
        // Check discrete components
        for (const [name, spec] of Object.entries(this.discrete)) {
            if (!(name in action)) return false;
            const value = action[name];
            if (!Number.isInteger(value) || value < 0 || value >= spec.n) return false;
        }
        
        // Check continuous components
        for (const [name, spec] of Object.entries(this.continuous)) {
            if (!(name in action)) return false;
            const value = action[name];
            const low = spec.low ?? -1;
            const high = spec.high ?? 1;
            
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    const l = Array.isArray(low) ? low[i] : low;
                    const h = Array.isArray(high) ? high[i] : high;
                    if (value[i] < l || value[i] > h) return false;
                }
            } else {
                if (value < low || value > high) return false;
            }
        }
        
        return true;
    }

    /**
     * Get flat representation for neural networks
     */
    flatten(action) {
        const flat = [];
        
        // One-hot encode discrete
        for (const [name, spec] of Object.entries(this.discrete)) {
            const oneHot = new Array(spec.n).fill(0);
            oneHot[action[name]] = 1;
            flat.push(...oneHot);
        }
        
        // Flatten continuous
        for (const [name, spec] of Object.entries(this.continuous)) {
            const value = action[name];
            if (Array.isArray(value)) {
                flat.push(...value);
            } else {
                flat.push(value);
            }
        }
        
        return flat;
    }

    /**
     * Reconstruct action from flat representation
     */
    unflatten(flat) {
        const action = {};
        let idx = 0;
        
        // Decode discrete (one-hot)
        for (const [name, spec] of Object.entries(this.discrete)) {
            const oneHot = flat.slice(idx, idx + spec.n);
            action[name] = oneHot.indexOf(Math.max(...oneHot));
            idx += spec.n;
        }
        
        // Decode continuous
        for (const [name, spec] of Object.entries(this.continuous)) {
            const shape = spec.shape ?? [1];
            const size = shape.reduce((a, b) => a * b, 1);
            const value = flat.slice(idx, idx + size);
            action[name] = shape.length <= 1 ? value[0] : value;
            idx += size;
        }
        
        return action;
    }

    /**
     * Get space info
     */
    toJSON() {
        return {
            type: 'Hybrid',
            discrete: { ...this.discrete },
            continuous: { ...this.continuous },
            discreteCount: this.discreteCount,
            continuousCount: this.continuousCount,
            continuousDim: this.continuousDim,
            flatDim: this._getFlatDim()
        };
    }

    _getFlatDim() {
        let dim = 0;
        
        // One-hot dimensions
        for (const spec of Object.values(this.discrete)) {
            dim += spec.n;
        }
        
        // Continuous dimensions
        dim += this.continuousDim;
        
        return dim;
    }
}

/**
 * Structured Action
 * Represents a hybrid action with both discrete and continuous components.
 */
export class StructuredAction {
    constructor(components = {}) {
        this.components = { ...components };
        this.timestamp = Date.now();
        this.metadata = new Map();
    }

    /**
     * Set discrete component
     */
    discrete(name, value) {
        this.components[name] = {
            type: 'discrete',
            value
        };
        return this;
    }

    /**
     * Set continuous component
     */
    continuous(name, value) {
        this.components[name] = {
            type: 'continuous',
            value: Array.isArray(value) ? value : [value]
        };
        return this;
    }

    /**
     * Get discrete value
     */
    getDiscrete(name) {
        const comp = this.components[name];
        return comp?.type === 'discrete' ? comp.value : null;
    }

    /**
     * Get continuous value
     */
    getContinuous(name) {
        const comp = this.components[name];
        if (comp?.type !== 'continuous') return null;
        return comp.value.length === 1 ? comp.value[0] : comp.value;
    }

    /**
     * Get all discrete components
     */
    getAllDiscrete() {
        const result = {};
        for (const [name, comp] of Object.entries(this.components)) {
            if (comp.type === 'discrete') {
                result[name] = comp.value;
            }
        }
        return result;
    }

    /**
     * Get all continuous components
     */
    getAllContinuous() {
        const result = {};
        for (const [name, comp] of Object.entries(this.components)) {
            if (comp.type === 'continuous') {
                result[name] = comp.value.length === 1 ? comp.value[0] : comp.value;
            }
        }
        return result;
    }

    /**
     * Clone action
     */
    clone() {
        const cloned = new StructuredAction();
        cloned.components = JSON.parse(JSON.stringify(this.components));
        cloned.timestamp = this.timestamp;
        return cloned;
    }

    /**
     * Set metadata
     */
    setMetadata(key, value) {
        this.metadata.set(key, value);
        return this;
    }

    /**
     * Get metadata
     */
    getMetadata(key) {
        return this.metadata.get(key);
    }

    /**
     * Convert to flat array
     */
    flatten() {
        const flat = [];
        
        // Discrete first (sorted by name for consistency)
        const discreteKeys = Object.keys(this.components)
            .filter(k => this.components[k].type === 'discrete')
            .sort();
        
        for (const key of discreteKeys) {
            flat.push(this.components[key].value);
        }
        
        // Continuous (sorted by name)
        const continuousKeys = Object.keys(this.components)
            .filter(k => this.components[k].type === 'continuous')
            .sort();
        
        for (const key of continuousKeys) {
            flat.push(...this.components[key].value);
        }
        
        return flat;
    }

    /**
     * To JSON
     */
    toJSON() {
        return {
            components: { ...this.components },
            timestamp: this.timestamp,
            metadata: Object.fromEntries(this.metadata)
        };
    }

    /**
     * From JSON
     */
    static fromJSON(json) {
        const action = new StructuredAction(json.components);
        action.timestamp = json.timestamp;
        
        if (json.metadata) {
            for (const [key, value] of Object.entries(json.metadata)) {
                action.metadata.set(key, value);
            }
        }
        
        return action;
    }
}

/**
 * Hybrid Environment Adapter
 * Unified interface for environments with mixed action spaces.
 */
export class HybridEnvironmentAdapter {
    constructor(baseEnv, hybridSpec = null) {
        this.baseEnv = baseEnv;
        
        // Create or use provided hybrid action space
        if (hybridSpec) {
            this.actionSpace = new HybridActionSpace(hybridSpec);
        } else {
            this.actionSpace = this._inferHybridSpace(baseEnv);
        }
        
        // Observation space
        this.observationSpace = baseEnv.observationSpace;
        
        // Action decomposition
        this.discreteActions = Object.keys(this.actionSpace.discrete);
        this.continuousActions = Object.keys(this.actionSpace.continuous);
    }

    /**
     * Infer hybrid space from environment
     */
    _inferHybridSpace(env) {
        const spec = { discrete: {}, continuous: {} };
        
        // Check if env has compound action space
        if (env.actionSpace?.type === 'Hybrid') {
            return new HybridActionSpace({
                discrete: env.actionSpace.discrete ?? {},
                continuous: env.actionSpace.continuous ?? {}
            });
        }
        
        // Check for tuple/multi-discrete + box
        if (env.actionSpace?.type === 'Tuple') {
            for (let i = 0; i < env.actionSpace.length; i++) {
                const space = env.actionSpace[i];
                if (space.type === 'Discrete') {
                    spec.discrete[`action_${i}`] = { n: space.n };
                } else if (space.type === 'Box') {
                    spec.continuous[`action_${i}`] = {
                        shape: space.shape,
                        low: space.low,
                        high: space.high
                    };
                }
            }
        }
        
        // Default: wrap single action space
        if (Object.keys(spec.discrete).length === 0 && Object.keys(spec.continuous).length === 0) {
            if (env.actionSpace?.type === 'Discrete') {
                spec.discrete.main = { n: env.actionSpace.n };
            } else if (env.actionSpace?.type === 'Box') {
                spec.continuous.main = {
                    shape: env.actionSpace.shape,
                    low: env.actionSpace.low,
                    high: env.actionSpace.high
                };
            }
        }
        
        return new HybridActionSpace(spec);
    }

    /**
     * Reset environment
     */
    reset(options = {}) {
        const result = this.baseEnv.reset(options);
        return {
            observation: result.observation,
            info: result.info ?? {}
        };
    }

    /**
     * Step with hybrid action
     */
    step(action) {
        // Convert structured action to environment format
        const envAction = this._convertToEnvAction(action);
        
        const result = this.baseEnv.step(envAction);
        
        return {
            observation: result.observation,
            reward: result.reward ?? 0,
            terminated: result.terminated ?? result.done ?? false,
            truncated: result.truncated ?? false,
            info: result.info ?? {}
        };
    }

    /**
     * Convert structured action to environment format
     */
    _convertToEnvAction(action) {
        if (action instanceof StructuredAction) {
            // Extract components based on environment expectations
            if (this.baseEnv.actionSpace?.type === 'Hybrid') {
                // Environment expects hybrid format
                return {
                    discrete: action.getAllDiscrete(),
                    continuous: action.getAllContinuous()
                };
            }
            
            if (this.baseEnv.actionSpace?.type === 'Tuple') {
                // Convert to tuple
                const tuple = [];
                for (const name of this.discreteActions) {
                    tuple.push(action.getDiscrete(name));
                }
                for (const name of this.continuousActions) {
                    tuple.push(action.getContinuous(name));
                }
                return tuple;
            }
            
            // Single action space - use primary component
            if (this.discreteActions.length > 0) {
                return action.getDiscrete(this.discreteActions[0]);
            }
            if (this.continuousActions.length > 0) {
                return action.getContinuous(this.continuousActions[0]);
            }
        }
        
        // Pass through if already in correct format
        return action;
    }

    /**
     * Create structured action from components
     */
    createAction(discrete = {}, continuous = {}) {
        const action = new StructuredAction();
        
        for (const [name, value] of Object.entries(discrete)) {
            action.discrete(name, value);
        }
        
        for (const [name, value] of Object.entries(continuous)) {
            action.continuous(name, value);
        }
        
        return action;
    }

    /**
     * Sample from action space
     */
    sample() {
        const sampled = this.actionSpace.sample();
        return this.createAction(
            this.discreteActions.reduce((acc, name) => {
                acc[name] = sampled[name];
                return acc;
            }, {}),
            this.continuousActions.reduce((acc, name) => {
                acc[name] = sampled[name];
                return acc;
            }, {})
        );
    }

    /**
     * Check if action is valid
     */
    isValidAction(action) {
        if (action instanceof StructuredAction) {
            const flat = this.actionSpace.flatten({
                ...action.getAllDiscrete(),
                ...action.getAllContinuous()
            });
            // Validate by reconstructing
            const reconstructed = this.actionSpace.unflatten(flat);
            return this.actionSpace.contains(reconstructed);
        }
        return this.actionSpace.contains(action);
    }

    /**
     * Get action space info
     */
    getInfo() {
        return {
            type: 'Hybrid',
            actionSpace: this.actionSpace.toJSON(),
            observationSpace: this.observationSpace,
            discreteActions: this.discreteActions,
            continuousActions: this.continuousActions
        };
    }

    /**
     * Render
     */
    render() {
        return this.baseEnv.render?.();
    }

    /**
     * Close
     */
    close() {
        return this.baseEnv.close?.();
    }
}

/**
 * Hybrid Action Selector
 * Selects both discrete and continuous actions simultaneously.
 */
export class HybridActionSelector {
    constructor(config = {}) {
        this.config = {
            discreteStrategy: config.discreteStrategy ?? 'argmax',
            continuousStrategy: config.continuousStrategy ?? 'sample',
            temperature: config.temperature ?? 1.0,
            ...config
        };
        
        this.discreteValues = new Map();
        this.continuousValues = new Map();
    }

    /**
     * Set action values
     */
    setActionValues(neuralOutput, actionSpace) {
        let idx = 0;
        
        // Process discrete (one-hot)
        for (const [name, spec] of Object.entries(actionSpace.discrete)) {
            const logits = neuralOutput.slice(idx, idx + spec.n);
            this.discreteValues.set(name, logits);
            idx += spec.n;
        }
        
        // Process continuous
        for (const [name, spec] of Object.entries(actionSpace.continuous)) {
            const shape = spec.shape ?? [1];
            const size = shape.reduce((a, b) => a * b, 1);
            const values = neuralOutput.slice(idx, idx + size);
            this.continuousValues.set(name, values);
            idx += size;
        }
    }

    /**
     * Select hybrid action
     */
    select(actionSpace, options = {}) {
        const action = new StructuredAction();
        const { exploration = 0.1 } = options;
        
        // Select discrete actions
        for (const [name, spec] of Object.entries(actionSpace.discrete)) {
            const logits = this.discreteValues.get(name) ?? new Array(spec.n).fill(0);
            
            if (Math.random() < exploration) {
                // Explore: random action
                action.discrete(name, Math.floor(Math.random() * spec.n));
            } else {
                // Exploit: argmax or softmax sample
                if (this.config.discreteStrategy === 'argmax') {
                    action.discrete(name, this._argmax(logits));
                } else {
                    action.discrete(name, this._softmaxSample(logits, this.config.temperature));
                }
            }
        }
        
        // Select continuous actions
        for (const [name, spec] of Object.entries(actionSpace.continuous)) {
            const values = this.continuousValues.get(name) ?? [0];
            const low = spec.low ?? -1;
            const high = spec.high ?? 1;
            
            if (Math.random() < exploration) {
                // Explore: random
                const randomVal = Array.isArray(low)
                    ? low.map((l, i) => l + Math.random() * ((Array.isArray(high) ? high[i] : high) - l))
                    : low + Math.random() * (high - low);
                action.continuous(name, randomVal);
            } else {
                // Exploit: network output with activation
                if (this.config.continuousStrategy === 'sample') {
                    // Add noise for sampling
                    const noise = values.map(() => (Math.random() - 0.5) * exploration);
                    const noisy = values.map((v, i) => v + noise[i]);
                    action.continuous(name, this._scaleToRange(noisy, low, high));
                } else {
                    // Deterministic
                    action.continuous(name, this._scaleToRange(values, low, high));
                }
            }
        }
        
        return action;
    }

    _argmax(arr) {
        return arr.indexOf(Math.max(...arr));
    }

    _softmaxSample(logits, temperature = 1.0) {
        const scaled = logits.map(l => l / temperature);
        const maxLogit = Math.max(...scaled);
        const exp = scaled.map(l => Math.exp(l - maxLogit));
        const sum = exp.reduce((a, b) => a + b, 0);
        const probs = exp.map(e => e / sum);
        
        const r = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (r <= cumsum) return i;
        }
        return probs.length - 1;
    }

    _scaleToRange(values, low, high) {
        // Tanh scaling to [-1, 1] then to [low, high]
        const scaled = values.map(v => Math.tanh(v));
        
        if (Array.isArray(low)) {
            return scaled.map((s, i) => {
                const h = Array.isArray(high) ? high[i] : high;
                return ((s + 1) / 2) * (h - low[i]) + low[i];
            });
        }
        
        return scaled.map(s => ((s + 1) / 2) * (high - low) + low);
    }
}

/**
 * Factory for creating hybrid action spaces
 */
export class HybridActionSpaceFactory {
    /**
     * Create robot arm action space
     */
    static createRobotArm(joints = 3, gripActions = 2) {
        const spec = {
            discrete: {},
            continuous: {}
        };
        
        // Discrete grip actions
        for (let i = 0; i < gripActions; i++) {
            spec.discrete[`grip_${i}`] = { n: 2 }; // open/close
        }
        
        // Continuous joint angles
        for (let i = 0; i < joints; i++) {
            spec.continuous[`joint_${i}`] = {
                shape: [1],
                low: -Math.PI,
                high: Math.PI
            };
        }
        
        return new HybridActionSpace(spec);
    }

    /**
     * Create navigation + interaction space
     */
    static createNavigationInteraction() {
        return new HybridActionSpace({
            discrete: {
                interact: { n: 3 } // none, use, examine
            },
            continuous: {
                velocity: { shape: [2], low: -1, high: 1 }, // x, y
                rotation: { shape: [1], low: -1, high: 1 }
            }
        });
    }

    /**
     * Create custom hybrid space
     */
    static createCustom(discreteSpec, continuousSpec) {
        return new HybridActionSpace({
            discrete: discreteSpec,
            continuous: continuousSpec
        });
    }
}
