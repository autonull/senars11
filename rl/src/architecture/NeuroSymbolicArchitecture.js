/**
 * Unified Neuro-Symbolic Architecture Framework
 * Parameterized, modular architecture for breakthrough RL performance.
 */
import { Component } from '../composable/Component.js';
import { ComponentRegistry, globalRegistry } from '../composable/ComponentRegistry.js';
import { CompositionEngine } from '../composable/CompositionEngine.js';
import { TensorLogicBridge, SymbolicTensor } from '../neurosymbolic/TensorLogicBridge.js';
import { WorldModel } from '../neurosymbolic/WorldModel.js';
import { SkillLibrary, SkillDiscoveryEngine } from '../skills/HierarchicalSkillSystem.js';

/**
 * Neuro-Symbolic Architecture Configuration
 */
export class ArchitectureConfig {
    constructor(config = {}) {
        this.architecture = config.architecture ?? 'dual-process';
        this.reasoning = config.reasoning ?? 'metta';
        this.grounding = config.grounding ?? 'learned';
        this.planning = config.planning ?? true;
        this.skillDiscovery = config.skillDiscovery ?? false;
        this.worldModel = config.worldModel ?? false;
        this.intrinsicMotivation = config.intrinsicMotivation ?? 'none';
        this.distributed = config.distributed ?? false;
        this.metaLearning = config.metaLearning ?? false;
        
        // Hyperparameters
        this.hyperparams = {
            learningRate: config.learningRate ?? 0.001,
            discountFactor: config.discountFactor ?? 0.99,
            explorationRate: config.explorationRate ?? 0.1,
            planningHorizon: config.planningHorizon ?? 5,
            worldModelHorizon: config.worldModelHorizon ?? 10,
            skillThreshold: config.skillThreshold ?? 0.5,
            ...config.hyperparams
        };
    }

    clone(overrides = {}) {
        return new ArchitectureConfig({ ...this, ...overrides });
    }

    toJSON() {
        return { ...this, hyperparams: { ...this.hyperparams } };
    }
}

/**
 * Neuro-Symbolic Processing Unit
 * Core computational unit that integrates neural and symbolic processing.
 */
export class NeuroSymbolicUnit extends Component {
    constructor(config = {}) {
        super({
            inputDim: config.inputDim ?? 64,
            hiddenDim: config.hiddenDim ?? 128,
            outputDim: config.outputDim ?? 32,
            symbolDim: config.symbolDim ?? 16,
            activation: config.activation ?? 'relu',
            ...config
        });
        
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

    /**
     * Process input through neural-symbolic pipeline.
     */
    async process(input, context = {}) {
        const { lift = true, ground = false, attend = false } = context;

        // Neural encoding
        const encoded = this.encode(input);

        // Symbolic lifting
        const lifted = lift ? this.lift(encoded) : encoded;

        // Attention modulation
        const attended = attend ? this.applyAttention(lifted) : lifted;

        // Symbolic processing
        const processed = await this.symbolicProcess(attended);

        // Grounding back to neural
        return ground ? this.ground(processed) : processed;
    }

    encode(input) {
        if (input instanceof SymbolicTensor) return input;
        const data = Array.isArray(input) ? new Float32Array(input) : new Float32Array([input]);
        return new SymbolicTensor(data, [data.length]);
    }

    lift(tensor) {
        return this.bridge.liftToSymbols(tensor, { threshold: 0.3 });
    }

    ground(symbols) {
        return this.bridge.groundToTensor(symbols, [this.config.outputDim]);
    }

    applyAttention(tensor) {
        if (!tensor.symbols?.size) return tensor;
        
        const mask = this.bridge.createAttentionMask(
            tensor,
            new Set(Array.from(tensor.symbols.values()).map(s => s.symbol))
        );
        
        return this.bridge.symbolicMul(tensor, mask, 'intersection');
    }

    async symbolicProcess(input) {
        // Override in subclasses for specific symbolic reasoning
        return input;
    }

    setState(neural, symbolic = null) {
        this.state.neural = neural;
        if (symbolic) {
            this.state.symbolic = symbolic;
        }
        this.emit('stateUpdate', { neural, symbolic: this.state.symbolic });
    }

    getState() {
        return { ...this.state };
    }
}

/**
 * Neuro-Symbolic Layer
 * Composable layer that can be stacked to form architectures.
 */
export class NeuroSymbolicLayer extends Component {
    constructor(config = {}) {
        super({
            type: config.type ?? 'feedforward',
            units: config.units ?? 64,
            activation: config.activation ?? 'relu',
            symbolic: config.symbolic ?? true,
            attention: config.attention ?? false,
            residual: config.residual ?? false,
            ...config
        });
        
        this.units = [];
        this.connections = new Map();
    }

    async onInitialize() {
        for (let i = 0; i < this.config.units; i++) {
            const unit = new NeuroSymbolicUnit({
                ...this.config,
                id: `unit_${i}`
            });
            await unit.initialize();
            this.units.push(unit);
        }
    }

    async process(inputs, context = {}) {
        const outputs = await Promise.all(
            this.units.map(unit => unit.process(inputs, context))
        );
        
        // Aggregate outputs
        return this.aggregate(outputs);
    }

    aggregate(outputs) {
        // Mean aggregation for symbolic tensors
        if (outputs[0] instanceof SymbolicTensor) {
            const aggregated = outputs[0].clone();
            for (let i = 1; i < outputs.length; i++) {
                for (let j = 0; j < aggregated.data.length; j++) {
                    aggregated.data[j] += outputs[i].data[j];
                }
            }
            for (let i = 0; i < aggregated.data.length; i++) {
                aggregated.data[i] /= outputs.length;
            }
            return aggregated;
        }
        
        return outputs;
    }

    connect(sourceLayer, targetUnitIdx = null) {
        const connectionId = `${sourceLayer.config.id || 'source'}->${this.config.id || 'target'}`;
        this.connections.set(connectionId, {
            source: sourceLayer,
            targetUnits: targetUnitIdx !== null ? [targetUnitIdx] : null
        });
        return this;
    }
}

/**
 * Neuro-Symbolic Architecture Builder
 * Fluent API for constructing architectures.
 */
export class ArchitectureBuilder {
    constructor() {
        this.layers = [];
        this.connections = [];
        this.config = new ArchitectureConfig();
        this.registry = globalRegistry;
    }

    withConfig(config) {
        this.config = new ArchitectureConfig(config);
        return this;
    }

    addLayer(type, options = {}) {
        const layer = new NeuroSymbolicLayer({
            type,
            id: `layer_${this.layers.length}`,
            ...options
        });
        this.layers.push(layer);
        return this;
    }

    addPerceptionLayer(options = {}) {
        return this.addLayer('perception', {
            units: 32,
            symbolic: true,
            attention: true,
            ...options
        });
    }

    addReasoningLayer(options = {}) {
        return this.addLayer('reasoning', {
            units: 64,
            symbolic: true,
            attention: false,
            ...options
        });
    }

    addPlanningLayer(options = {}) {
        return this.addLayer('planning', {
            units: 48,
            symbolic: true,
            attention: true,
            ...options
        });
    }

    addActionLayer(options = {}) {
        return this.addLayer('action', {
            units: 16,
            symbolic: false,
            attention: false,
            ...options
        });
    }

    connect(fromIdx, toIdx, targetUnits = null) {
        this.connections.push({ from: fromIdx, to: toIdx, targetUnits });
        return this;
    }

    chain() {
        for (let i = 0; i < this.layers.length - 1; i++) {
            this.connect(i, i + 1);
        }
        return this;
    }

    withResidualConnections() {
        for (let i = 0; i < this.layers.length - 2; i++) {
            this.connect(i, i + 2);
        }
        return this;
    }

    withAttention() {
        this.layers.forEach(layer => {
            layer.config.attention = true;
        });
        return this;
    }

    async build() {
        const architecture = new NeuroSymbolicArchitecture(this.config);
        
        for (const layer of this.layers) {
            architecture.addLayer(layer.config.id, layer);
        }
        
        for (const conn of this.connections) {
            const fromLayer = this.layers[conn.from];
            const toLayer = this.layers[conn.to];
            toLayer.connect(fromLayer, conn.targetUnits);
        }
        
        return architecture;
    }
}

/**
 * Neuro-Symbolic Architecture
 * Complete architecture composed of layers.
 */
export class NeuroSymbolicArchitecture extends Component {
    constructor(config = new ArchitectureConfig()) {
        super(config);
        this.config = config;
        this.layers = new Map();
        this.executionOrder = [];
        this.compositionEngine = new CompositionEngine();
    }

    async onInitialize() {
        for (const layer of this.layers.values()) {
            await layer.initialize();
        }
        
        this.buildExecutionOrder();
    }

    addLayer(name, layer) {
        this.layers.set(name, layer);
        this.executionOrder.push(name);
        return this;
    }

    getLayer(name) {
        return this.layers.get(name);
    }

    buildExecutionOrder() {
        // Topological sort based on connections
        // For now, use insertion order
        this.executionOrder = Array.from(this.layers.keys());
    }

    async process(input, context = {}) {
        let current = input;
        const activations = new Map();

        for (const layerName of this.executionOrder) {
            const layer = this.layers.get(layerName);
            if (!layer) continue;

            const output = await layer.process(current, {
                ...context,
                layer: layerName
            });

            activations.set(layerName, output);
            current = output;
        }

        return {
            output: current,
            activations: Object.fromEntries(activations)
        };
    }

    async act(observation, goal = null) {
        const context = goal ? { goal, lift: true, ground: true } : { lift: true, ground: true };
        const result = await this.process(observation, context);
        
        // Extract action from output
        if (result.output instanceof SymbolicTensor) {
            return this.extractAction(result.output);
        }
        
        return result.output;
    }

    extractAction(tensor) {
        // Argmax for discrete actions
        let maxIdx = 0;
        let maxVal = tensor.data[0];
        
        for (let i = 1; i < tensor.data.length; i++) {
            if (tensor.data[i] > maxVal) {
                maxVal = tensor.data[i];
                maxIdx = i;
            }
        }
        
        return maxIdx;
    }

    async learn(transition, reward) {
        const { state, action, nextState, done } = transition;
        
        // Propagate learning signal through layers
        for (const layerName of [...this.executionOrder].reverse()) {
            const layer = this.layers.get(layerName);
            if (layer?.learn) {
                await layer.learn(transition, reward);
            }
        }
        
        this.emit('learning', { transition, reward });
    }

    serialize() {
        return {
            config: this.config.toJSON(),
            layers: Array.from(this.layers.entries()).map(([name, layer]) => ({
                name,
                config: layer.config
            })),
            executionOrder: this.executionOrder
        };
    }
}

/**
 * Pre-built Architecture Templates
 */
export const ArchitectureTemplates = {
    /**
     * Dual-Process Architecture
     * Fast neural (System 1) + Slow symbolic (System 2)
     */
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

    /**
     * Pure Neural Architecture
     * Fast, end-to-end differentiable
     */
    neural(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'neural' })
            .addLayer('input', { type: 'input', units: 16, symbolic: false })
            .addLayer('hidden1', { type: 'feedforward', units: 64, symbolic: false })
            .addLayer('hidden2', { type: 'feedforward', units: 64, symbolic: false })
            .addLayer('output', { type: 'output', units: 16, symbolic: false })
            .chain();
    },

    /**
     * Pure Symbolic Architecture
     * Interpretable, rule-based
     */
    symbolic(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'symbolic' })
            .addLayer('perception', { type: 'symbolic', units: 32, symbolic: true, attention: true })
            .addLayer('reasoning', { type: 'symbolic', units: 64, symbolic: true })
            .addLayer('action', { type: 'symbolic', units: 16, symbolic: true })
            .chain();
    },

    /**
     * Hierarchical Architecture
     * Multi-level abstraction
     */
    hierarchical(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'hierarchical' })
            .addLayer('low', { type: 'reactive', units: 16, symbolic: false })
            .addLayer('mid', { type: 'deliberative', units: 32, symbolic: true })
            .addLayer('high', { type: 'strategic', units: 24, symbolic: true })
            .chain()
            .withResidualConnections();
    },

    /**
     * Attention-Based Architecture
     * Focus on relevant features
     */
    attention(config = {}) {
        return new ArchitectureBuilder()
            .withConfig({ ...config, architecture: 'attention' })
            .addLayer('encoder', { type: 'encoder', units: 64, symbolic: true, attention: true })
            .addLayer('attention', { type: 'attention', units: 64, symbolic: true, attention: true })
            .addLayer('decoder', { type: 'decoder', units: 32, symbolic: true })
            .chain();
    },

    /**
     * World Model Architecture
     * Imagination-based planning
     */
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

/**
 * Architecture Factory
 * Creates architectures from configuration.
 */
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
