/**
 * Hybrid Action Space System
 * True simultaneous operation of both continuous and discrete actions.
 * For environments requiring mixed action types (e.g., discrete grip + continuous movement).
 */
import { mergeConfig } from '../utils/ConfigHelper.js';
import { deepClone } from '../../../core/src/util/CloneUtils.js';

const HYBRID_SPACE_DEFAULTS = {
    discrete: {},
    continuous: {},
    defaultLow: -1,
    defaultHigh: 1
};

const STRUCTURED_ACTION_DEFAULTS = {
    maxMetadataSize: 100
};

const SELECTOR_DEFAULTS = {
    discreteStrategy: 'argmax',
    continuousStrategy: 'sample',
    temperature: 1.0,
    defaultExploration: 0.1
};

const ADAPTER_DEFAULTS = {
    maxHistorySize: 100
};

const computeDim = (specs) =>
    Object.values(specs).reduce((dim, spec) =>
        dim + (spec.shape?.reduce((a, b) => a * b, 1) ?? 1), 0);

const sampleRange = (low, high, shape) => {
    const size = shape.reduce((a, b) => a * b, 1);
    if (Array.isArray(low)) {
        return low.map((l, i) => {
            const h = Array.isArray(high) ? high[i] : high;
            return l + Math.random() * (h - l);
        });
    }
    return Array.from({ length: size }, () => low + Math.random() * (high - low));
};

export class HybridActionSpace {
    constructor(spec = {}) {
        const config = mergeConfig(HYBRID_SPACE_DEFAULTS, spec);
        this.type = 'Hybrid';
        this.discrete = config.discrete;
        this.continuous = config.continuous;
        this.discreteCount = Object.keys(this.discrete).length;
        this.continuousCount = Object.keys(this.continuous).length;
        this.continuousDim = computeDim(this.continuous);
    }

    sample() {
        const action = {};

        Object.entries(this.discrete).forEach(([name, spec]) => {
            action[name] = Math.floor(Math.random() * spec.n);
        });

        Object.entries(this.continuous).forEach(([name, spec]) => {
            const low = spec.low ?? -1;
            const high = spec.high ?? 1;
            const shape = spec.shape ?? [1];
            action[name] = sampleRange(low, high, shape);

            if (shape.length === 1 && shape[0] === 1 && Array.isArray(action[name])) {
                action[name] = action[name][0];
            }
        });

        return action;
    }

    contains(action) {
        if (!action || typeof action !== 'object') return false;

        for (const [name, spec] of Object.entries(this.discrete)) {
            if (!(name in action)) return false;
            const value = action[name];
            if (!Number.isInteger(value) || value < 0 || value >= spec.n) return false;
        }

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

    flatten(action) {
        const flat = [];

        Object.entries(this.discrete).forEach(([name, spec]) => {
            const oneHot = new Array(spec.n).fill(0);
            oneHot[action[name]] = 1;
            flat.push(...oneHot);
        });

        Object.entries(this.continuous).forEach(([name]) => {
            const value = action[name];
            flat.push(...(Array.isArray(value) ? value : [value]));
        });

        return flat;
    }

    unflatten(flat) {
        const action = {};
        let idx = 0;

        Object.entries(this.discrete).forEach(([name, spec]) => {
            const oneHot = flat.slice(idx, idx + spec.n);
            action[name] = oneHot.indexOf(Math.max(...oneHot));
            idx += spec.n;
        });

        Object.entries(this.continuous).forEach(([name, spec]) => {
            const shape = spec.shape ?? [1];
            const size = shape.reduce((a, b) => a * b, 1);
            const value = flat.slice(idx, idx + size);
            action[name] = shape.length <= 1 ? value[0] : value;
            idx += size;
        });

        return action;
    }

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
        const discreteDim = Object.values(this.discrete).reduce((sum, spec) => sum + spec.n, 0);
        return discreteDim + this.continuousDim;
    }
}

export class StructuredAction {
    constructor(components = {}) {
        const config = mergeConfig(STRUCTURED_ACTION_DEFAULTS, {});
        this.components = { ...components };
        this.timestamp = Date.now();
        this.metadata = new Map();
        this._maxMetadata = config.maxMetadataSize;
    }

    discrete(name, value) {
        this.components[name] = { type: 'discrete', value };
        return this;
    }

    continuous(name, value) {
        this.components[name] = {
            type: 'continuous',
            value: Array.isArray(value) ? value : [value]
        };
        return this;
    }

    getDiscrete(name) {
        const comp = this.components[name];
        return comp?.type === 'discrete' ? comp.value : null;
    }

    getContinuous(name) {
        const comp = this.components[name];
        if (comp?.type !== 'continuous') return null;
        return comp.value.length === 1 ? comp.value[0] : comp.value;
    }

    getAllDiscrete() {
        return Object.fromEntries(
            Object.entries(this.components)
                .filter(([, comp]) => comp.type === 'discrete')
                .map(([name, comp]) => [name, comp.value])
        );
    }

    getAllContinuous() {
        return Object.fromEntries(
            Object.entries(this.components)
                .filter(([, comp]) => comp.type === 'continuous')
                .map(([name, comp]) => [name, comp.value.length === 1 ? comp.value[0] : comp.value])
        );
    }

    clone() {
        const cloned = new StructuredAction();
        cloned.components = deepClone(this.components);
        cloned.timestamp = this.timestamp;
        return cloned;
    }

    setMetadata(key, value) {
        if (this.metadata.size < this._maxMetadata) {
            this.metadata.set(key, value);
        }
        return this;
    }

    getMetadata(key) {
        return this.metadata.get(key);
    }

    flatten() {
        const flat = [];

        const discreteKeys = Object.keys(this.components)
            .filter(k => this.components[k].type === 'discrete')
            .sort();
        discreteKeys.forEach(key => flat.push(this.components[key].value));

        const continuousKeys = Object.keys(this.components)
            .filter(k => this.components[k].type === 'continuous')
            .sort();
        continuousKeys.forEach(key => flat.push(...this.components[key].value));

        return flat;
    }

    toJSON() {
        return {
            components: { ...this.components },
            timestamp: this.timestamp,
            metadata: Object.fromEntries(this.metadata)
        };
    }

    static fromJSON(json) {
        const action = new StructuredAction(json.components);
        action.timestamp = json.timestamp;

        if (json.metadata) {
            Object.entries(json.metadata).forEach(([key, value]) => {
                action.metadata.set(key, value);
            });
        }

        return action;
    }
}

export class HybridEnvironmentAdapter {
    constructor(baseEnv, hybridSpec = null) {
        const config = mergeConfig(ADAPTER_DEFAULTS, {});
        this.baseEnv = baseEnv;
        this.actionSpace = hybridSpec
            ? new HybridActionSpace(hybridSpec)
            : this._inferHybridSpace(baseEnv);
        this.observationSpace = baseEnv.observationSpace;
        this.discreteActions = Object.keys(this.actionSpace.discrete);
        this.continuousActions = Object.keys(this.actionSpace.continuous);
    }

    _inferHybridSpace(env) {
        const spec = { discrete: {}, continuous: {} };

        if (env.actionSpace?.type === 'Hybrid') {
            return new HybridActionSpace({
                discrete: env.actionSpace.discrete ?? {},
                continuous: env.actionSpace.continuous ?? {}
            });
        }

        if (env.actionSpace?.type === 'Tuple') {
            env.actionSpace.forEach((space, i) => {
                if (space.type === 'Discrete') {
                    spec.discrete[`action_${i}`] = { n: space.n };
                } else if (space.type === 'Box') {
                    spec.continuous[`action_${i}`] = {
                        shape: space.shape,
                        low: space.low,
                        high: space.high
                    };
                }
            });
        }

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

    reset(options = {}) {
        const result = this.baseEnv.reset(options);
        return { observation: result.observation, info: result.info ?? {} };
    }

    step(action) {
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

    _convertToEnvAction(action) {
        if (action instanceof StructuredAction) {
            if (this.baseEnv.actionSpace?.type === 'Hybrid') {
                return {
                    discrete: action.getAllDiscrete(),
                    continuous: action.getAllContinuous()
                };
            }

            if (this.baseEnv.actionSpace?.type === 'Tuple') {
                const tuple = [
                    ...this.discreteActions.map(name => action.getDiscrete(name)),
                    ...this.continuousActions.map(name => action.getContinuous(name))
                ];
                return tuple;
            }

            if (this.discreteActions.length > 0) {
                return action.getDiscrete(this.discreteActions[0]);
            }
            if (this.continuousActions.length > 0) {
                return action.getContinuous(this.continuousActions[0]);
            }
        }

        return action;
    }

    createAction(discrete = {}, continuous = {}) {
        const action = new StructuredAction();
        Object.entries(discrete).forEach(([name, value]) => action.discrete(name, value));
        Object.entries(continuous).forEach(([name, value]) => action.continuous(name, value));
        return action;
    }

    sample() {
        const sampled = this.actionSpace.sample();
        const discrete = this.discreteActions.reduce((acc, name) => {
            acc[name] = sampled[name];
            return acc;
        }, {});
        const continuous = this.continuousActions.reduce((acc, name) => {
            acc[name] = sampled[name];
            return acc;
        }, {});
        return this.createAction(discrete, continuous);
    }

    isValidAction(action) {
        if (action instanceof StructuredAction) {
            const flat = this.actionSpace.flatten({
                ...action.getAllDiscrete(),
                ...action.getAllContinuous()
            });
            const reconstructed = this.actionSpace.unflatten(flat);
            return this.actionSpace.contains(reconstructed);
        }
        return this.actionSpace.contains(action);
    }

    getInfo() {
        return {
            type: 'Hybrid',
            actionSpace: this.actionSpace.toJSON(),
            observationSpace: this.observationSpace,
            discreteActions: this.discreteActions,
            continuousActions: this.continuousActions
        };
    }

    render() {
        return this.baseEnv.render?.();
    }

    close() {
        return this.baseEnv.close?.();
    }
}

export class HybridActionSelector {
    constructor(config = {}) {
        this.config = mergeConfig(SELECTOR_DEFAULTS, config);
        this.discreteValues = new Map();
        this.continuousValues = new Map();
    }

    setActionValues(neuralOutput, actionSpace) {
        let idx = 0;

        Object.entries(actionSpace.discrete).forEach(([name, spec]) => {
            const logits = neuralOutput.slice(idx, idx + spec.n);
            this.discreteValues.set(name, logits);
            idx += spec.n;
        });

        Object.entries(actionSpace.continuous).forEach(([name, spec]) => {
            const shape = spec.shape ?? [1];
            const size = shape.reduce((a, b) => a * b, 1);
            const values = neuralOutput.slice(idx, idx + size);
            this.continuousValues.set(name, values);
            idx += size;
        });
    }

    select(actionSpace, options = {}) {
        const action = new StructuredAction();
        const { exploration = this.config.defaultExploration } = options;

        Object.entries(actionSpace.discrete).forEach(([name, spec]) => {
            const logits = this.discreteValues.get(name) ?? new Array(spec.n).fill(0);

            if (Math.random() < exploration) {
                action.discrete(name, Math.floor(Math.random() * spec.n));
            } else if (this.config.discreteStrategy === 'argmax') {
                action.discrete(name, this._argmax(logits));
            } else {
                action.discrete(name, this._softmaxSample(logits, this.config.temperature));
            }
        });

        Object.entries(actionSpace.continuous).forEach(([name, spec]) => {
            const values = this.continuousValues.get(name) ?? [0];
            const low = spec.low ?? -1;
            const high = spec.high ?? 1;

            if (Math.random() < exploration) {
                const randomVal = Array.isArray(low)
                    ? low.map((l, i) => l + Math.random() * ((Array.isArray(high) ? high[i] : high) - l))
                    : low + Math.random() * (high - low);
                action.continuous(name, randomVal);
            } else if (this.config.continuousStrategy === 'sample') {
                const noise = values.map(() => (Math.random() - 0.5) * exploration);
                const noisy = values.map((v, i) => v + noise[i]);
                action.continuous(name, this._scaleToRange(noisy, low, high));
            } else {
                action.continuous(name, this._scaleToRange(values, low, high));
            }
        });

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

export class HybridActionSpaceFactory {
    static createRobotArm(joints = 3, gripActions = 2) {
        const spec = { discrete: {}, continuous: {} };

        for (let i = 0; i < gripActions; i++) {
            spec.discrete[`grip_${i}`] = { n: 2 };
        }

        for (let i = 0; i < joints; i++) {
            spec.continuous[`joint_${i}`] = {
                shape: [1],
                low: -Math.PI,
                high: Math.PI
            };
        }

        return new HybridActionSpace(spec);
    }

    static createNavigationInteraction() {
        return new HybridActionSpace({
            discrete: { interact: { n: 3 } },
            continuous: {
                velocity: { shape: [2], low: -1, high: 1 },
                rotation: { shape: [1], low: -1, high: 1 }
            }
        });
    }

    static createCustom(discreteSpec, continuousSpec) {
        return new HybridActionSpace({ discrete: discreteSpec, continuous: continuousSpec });
    }
}
