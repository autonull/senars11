/**
 * Unified Architecture System
 * Consolidates NeuroSymbolicArchitecture, EvolutionaryArchitecture, and architecture utilities
 */
import { Component } from '../composable/Component.js';
import { CompositionEngine } from '../composable/CompositionEngine.js';
import { TensorLogicBridge, SymbolicTensor } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { PolicyUtils } from '../utils/PolicyUtils.js';

const ARCH_DEFAULTS = {
    architecture: 'dual-process',
    reasoning: 'metta',
    grounding: 'learned',
    planning: true,
    skillDiscovery: false,
    worldModel: false,
    intrinsicMotivation: 'none',
    distributed: false,
    metaLearning: false,
    hyperparams: {
        learningRate: 0.001,
        discountFactor: 0.99,
        explorationRate: 0.1,
        planningHorizon: 5,
        worldModelHorizon: 10,
        skillThreshold: 0.5
    }
};

const LAYER_DEFAULTS = {
    perception: { units: 32, symbolic: true, attention: true },
    reasoning: { units: 64, symbolic: true, attention: false },
    planning: { units: 48, symbolic: true, attention: true },
    action: { units: 16, symbolic: false, attention: false },
    input: { units: 16, symbolic: false },
    hidden: { units: 64, symbolic: false },
    output: { units: 16, symbolic: false },
    encoder: { units: 64, symbolic: true, attention: true },
    decoder: { units: 32, symbolic: true },
    dynamics: { units: 64, symbolic: true },
    predictor: { units: 32, symbolic: true },
    actor: { units: 16, symbolic: true },
    reactive: { units: 16, symbolic: false },
    deliberative: { units: 32, symbolic: true },
    strategic: { units: 24, symbolic: true },
    attention: { units: 64, symbolic: true, attention: true }
};

const UNIT_DEFAULTS = {
    inputDim: 64,
    hiddenDim: 128,
    outputDim: 32,
    symbolDim: 16,
    activation: 'relu'
};

const LAYER_CONFIG_DEFAULTS = {
    type: 'feedforward',
    units: 64,
    activation: 'relu',
    symbolic: true,
    attention: false,
    residual: false
};

const TEMPLATE_FACTORIES = {
    'dual-process': (config) => ({
        layers: [
            { type: 'perception', ...config.perception },
            { type: 'reasoning', ...config.reasoning },
            { type: 'planning', ...config.planning },
            { type: 'action', ...config.action }
        ],
        residual: true
    }),
    neural: (config) => ({
        layers: [
            { type: 'input', ...config.input },
            { type: 'hidden', ...config.hidden1 },
            { type: 'hidden', ...config.hidden2 },
            { type: 'output', ...config.output }
        ],
        residual: false
    }),
    symbolic: (config) => ({
        layers: [
            { type: 'perception', ...config.perception },
            { type: 'reasoning', ...config.reasoning },
            { type: 'action', ...config.action }
        ],
        residual: false
    }),
    hierarchical: (config) => ({
        layers: [
            { type: 'reactive', ...config.low },
            { type: 'deliberative', ...config.mid },
            { type: 'strategic', ...config.high }
        ],
        residual: true
    }),
    attention: (config) => ({
        layers: [
            { type: 'encoder', ...config.encoder },
            { type: 'attention', ...config.attention },
            { type: 'decoder', ...config.decoder }
        ],
        residual: false
    }),
    'world-model': (config) => ({
        layers: [
            { type: 'encoder', ...config.encoder },
            { type: 'dynamics', ...config.dynamics },
            { type: 'predictor', ...config.predictor },
            { type: 'actor', ...config.actor }
        ],
        residual: false
    })
};

export class ArchitectureConfig {
    constructor(config = {}) {
        const { hyperparams = {}, ...rest } = mergeConfig(ARCH_DEFAULTS, config);
        Object.assign(this, rest);
        this.hyperparams = mergeConfig(ARCH_DEFAULTS.hyperparams, hyperparams);
    }

    clone(overrides = {}) {
        return new ArchitectureConfig({ ...this, ...overrides });
    }

    toJSON() {
        return { ...this, hyperparams: { ...this.hyperparams } };
    }
}

export class NeuroSymbolicUnit extends Component {
    constructor(config = {}) {
        super(mergeConfig(UNIT_DEFAULTS, config));
        this.bridge = new TensorLogicBridge();
        this.state = null;
        this.symbols = new Map();
    }

    async onInitialize() {
        this.state = {
            neural: new Float32Array(this.config.inputDim),
            symbolic: new Map(),
            attention: new Float32Array(this.config.inputDim).fill(1)
        };
    }

    async process(input, context = {}) {
        const { lift = true, ground = false, attend = false } = context;
        const encoded = this._encode(input);
        const lifted = lift ? this._lift(encoded) : encoded;
        const attended = attend ? this._applyAttention(lifted) : lifted;
        const processed = await this.symbolicProcess(attended);
        return ground ? this._ground(processed) : processed;
    }

    _encode(input) {
        if (input instanceof SymbolicTensor) return input;
        const data = Array.isArray(input) ? new Float32Array(input) : new Float32Array([input]);
        return new SymbolicTensor(data, [data.length]);
    }

    _lift(tensor) {
        return this.bridge.liftToSymbols(tensor, { threshold: 0.3 });
    }

    _ground(symbols) {
        return this.bridge.groundToTensor(symbols, [this.config.outputDim]);
    }

    _applyAttention(tensor) {
        if (!tensor.symbols?.size) return tensor;
        const mask = this.bridge.createAttentionMask(
            tensor,
            new Set(Array.from(tensor.symbols.values()).map(s => s.symbol))
        );
        return this.bridge.symbolicMul(tensor, mask, 'intersection');
    }

    async symbolicProcess(input) { return input; }

    setState(neural, symbolic = null) {
        this.state.neural = neural;
        if (symbolic) this.state.symbolic = symbolic;
        this.emit('stateUpdate', { neural, symbolic: this.state.symbolic });
    }

    getState() { return { ...this.state }; }

    async learn(transition, reward) { /* Placeholder */ }
}

export class NeuroSymbolicLayer extends Component {
    constructor(config = {}) {
        super(mergeConfig(LAYER_CONFIG_DEFAULTS, config));
        this.units = [];
        this.connections = new Map();
    }

    async onInitialize() {
        this.units = Array.from({ length: this.config.units }, (_, i) => {
            const unit = new NeuroSymbolicUnit({ ...this.config, id: `unit_${i}` });
            unit.initialize();
            return unit;
        });
    }

    async process(inputs, context = {}) {
        const outputs = await Promise.all(this.units.map(unit => unit.process(inputs, context)));
        return this._aggregate(outputs);
    }

    _aggregate(outputs) {
        if (!(outputs[0] instanceof SymbolicTensor)) return outputs;
        const aggregated = outputs[0].clone();
        outputs.slice(1).forEach(output => {
            output.data.forEach((val, i) => { aggregated.data[i] += val; });
        });
        aggregated.data.forEach((_, i) => { aggregated.data[i] /= outputs.length; });
        return aggregated;
    }

    connect(sourceLayer, targetUnitIdx = null) {
        this.connections.set(`${sourceLayer.config.id || 'source'}->${this.config.id || 'target'}`, {
            source: sourceLayer,
            targetUnits: targetUnitIdx !== null ? [targetUnitIdx] : null
        });
        return this;
    }

    async learn(transition, reward) {
        this.units.forEach(unit => unit.learn?.(transition, reward));
    }
}

export class ArchitectureBuilder {
    constructor() {
        this.layers = [];
        this.connections = [];
        this.config = new ArchitectureConfig();
    }

    withConfig(config) {
        this.config = new ArchitectureConfig(config);
        return this;
    }

    addLayer(type, options = {}) {
        this.layers.push(new NeuroSymbolicLayer({
            type, id: `layer_${this.layers.length}`, ...options
        }));
        return this;
    }

    addPerceptionLayer(options = {}) {
        return this.addLayer('perception', { ...LAYER_DEFAULTS.perception, ...options });
    }

    addReasoningLayer(options = {}) {
        return this.addLayer('reasoning', { ...LAYER_DEFAULTS.reasoning, ...options });
    }

    addPlanningLayer(options = {}) {
        return this.addLayer('planning', { ...LAYER_DEFAULTS.planning, ...options });
    }

    addActionLayer(options = {}) {
        return this.addLayer('action', { ...LAYER_DEFAULTS.action, ...options });
    }

    connect(fromIdx, toIdx, targetUnits = null) {
        this.connections.push({ from: fromIdx, to: toIdx, targetUnits });
        return this;
    }

    chain() {
        this.layers.slice(0, -1).forEach((_, i) => this.connect(i, i + 1));
        return this;
    }

    withResidualConnections() {
        this.layers.slice(0, -2).forEach((_, i) => this.connect(i, i + 2));
        return this;
    }

    withAttention() {
        this.layers.forEach(layer => { layer.config.attention = true; });
        return this;
    }

    async build() {
        const architecture = new NeuroSymbolicArchitecture(this.config);
        this.layers.forEach(layer => architecture.addLayer(layer.config.id, layer));
        this.connections.forEach(conn => {
            const fromLayer = this.layers[conn.from];
            const toLayer = this.layers[conn.to];
            toLayer.connect(fromLayer, conn.targetUnits);
        });
        return architecture;
    }
}

export class NeuroSymbolicArchitecture extends Component {
    constructor(config = new ArchitectureConfig()) {
        super(config);
        this.config = config;
        this.layers = new Map();
        this.executionOrder = [];
        this.compositionEngine = new CompositionEngine();
    }

    async onInitialize() {
        await Promise.all(Array.from(this.layers.values()).map(layer => layer.initialize()));
        this.buildExecutionOrder();
    }

    addLayer(name, layer) {
        this.layers.set(name, layer);
        this.executionOrder.push(name);
        return this;
    }

    getLayer(name) { return this.layers.get(name); }
    buildExecutionOrder() { this.executionOrder = Array.from(this.layers.keys()); }

    async process(input, context = {}) {
        let current = input;
        const activations = new Map();

        for (const layerName of this.executionOrder) {
            const layer = this.layers.get(layerName);
            if (!layer) continue;
            const output = await layer.process(current, { ...context, layer: layerName });
            activations.set(layerName, output);
            current = output;
        }

        return { output: current, activations: Object.fromEntries(activations) };
    }

    async act(observation, goal = null) {
        const context = goal ? { goal, lift: true, ground: true } : { lift: true, ground: true };
        const result = await this.process(observation, context);
        return result.output instanceof SymbolicTensor
            ? this._extractAction(result.output)
            : result.output;
    }

    _extractAction(tensor) {
        return PolicyUtils.argmax(tensor.data);
    }

    async learn(transition, reward) {
        [...this.executionOrder].reverse().forEach(layerName => {
            const layer = this.layers.get(layerName);
            layer?.learn?.(transition, reward);
        });
        this.emit('learning', { transition, reward });
    }

    serialize() {
        return {
            config: this.config.toJSON(),
            layers: Array.from(this.layers.entries()).map(([name, layer]) => ({ name, config: layer.config })),
            executionOrder: this.executionOrder
        };
    }
}

export const ArchitectureTemplates = {
    dualProcess(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'dual-process' })
            .addPerceptionLayer({ units: 32 })
            .addReasoningLayer({ units: 64 })
            .addPlanningLayer({ units: 48 })
            .addActionLayer({ units: 16 })
            .chain()
            .withResidualConnections();
    },

    neural(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'neural' })
            .addLayer('input', { type: 'input', units: 16, symbolic: false })
            .addLayer('hidden1', { type: 'feedforward', units: 64, symbolic: false })
            .addLayer('hidden2', { type: 'feedforward', units: 64, symbolic: false })
            .addLayer('output', { type: 'output', units: 16, symbolic: false })
            .chain();
    },

    symbolic(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'symbolic' })
            .addLayer('perception', { type: 'symbolic', units: 32, symbolic: true, attention: true })
            .addLayer('reasoning', { type: 'symbolic', units: 64, symbolic: true })
            .addLayer('action', { type: 'symbolic', units: 16, symbolic: true })
            .chain();
    },

    hierarchical(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'hierarchical' })
            .addLayer('low', { type: 'reactive', units: 16, symbolic: false })
            .addLayer('mid', { type: 'deliberative', units: 32, symbolic: true })
            .addLayer('high', { type: 'strategic', units: 24, symbolic: true })
            .chain()
            .withResidualConnections();
    },

    attention(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'attention' })
            .addLayer('encoder', { type: 'encoder', units: 64, symbolic: true, attention: true })
            .addLayer('attention', { type: 'attention', units: 64, symbolic: true, attention: true })
            .addLayer('decoder', { type: 'decoder', units: 32, symbolic: true })
            .chain();
    },

    worldModel(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'world-model' })
            .addLayer('encoder', { type: 'encoder', units: 32 })
            .addLayer('dynamics', { type: 'dynamics', units: 64, symbolic: true })
            .addLayer('predictor', { type: 'predictor', units: 32 })
            .addLayer('actor', { type: 'actor', units: 16 })
            .chain();
    }
};

export class ArchitectureFactory {
    static create(name, config = {}) {
        const template = ArchitectureTemplates[name];
        if (!template) {
            throw new Error(`Unknown architecture: ${name}. Available: ${Object.keys(ArchitectureTemplates).join(', ')}`);
        }
        return template(config).build();
    }

    static register(name, builder) {
        ArchitectureTemplates[name] = builder;
    }

    static list() {
        return Object.keys(ArchitectureTemplates);
    }
}

export class EvolutionaryArchitecture extends Component {
    constructor(agent, config = {}) {
        super(mergeConfig({
            populationSize: 10,
            mutationRate: 0.1,
            elitismRatio: 0.2
        }, config));
        this.agent = agent;
        this.generation = 0;
    }

    async initialize() {
        this.emit('initialized', { generation: this.generation, populationSize: this.config.populationSize });
    }

    async act(observation, goal) {
        return Math.floor(Math.random() * 2);
    }

    async learn(observation, action, reward, nextObservation, done) {
        if (done) this.generation++;
    }

    evolve(architectures, fitnessFn) {
        return architectures[0]; // Placeholder
    }
}

export { NeuroSymbolicArchitecture as Architecture };
