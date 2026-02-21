/**
 * Emergent Cognitive Architecture
 * Self-organizing cognitive system with hybrid action control.
 * Solutions emerge from component interaction rather than hardcoded pipelines.
 */
import { Component } from '../composable/Component.js';
import { StructuredAction, HybridActionSelector } from '../environments/HybridActionSpace.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';
import { Experience } from '../experience/ExperienceSystem.js';
import { compose, pipe, Maybe, Stream } from '../functional/FunctionalUtils.js';

/**
 * Cognitive Primitive
 * Atomic cognitive operation that can compose with others.
 */
export class CognitivePrimitive extends Component {
    constructor(config = {}) {
        super({
            name: config.name ?? 'primitive',
            type: config.type ?? 'processing',
            inputs: config.inputs ?? [],
            outputs: config.outputs ?? [],
            parameters: config.parameters ?? {},
            ...config
        });
        
        this.connections = new Map();
        this.activationLevel = 0;
        this.learningRate = config.learningRate ?? 0.01;
    }

    /**
     * Process input and produce output
     */
    async process(input, context = {}) {
        throw new Error('CognitivePrimitive must implement process()');
    }

    /**
     * Connect to another primitive
     */
    connect(outputName, target, inputName) {
        if (!this.connections.has(outputName)) {
            this.connections.set(outputName, []);
        }
        this.connections.get(outputName).push({ target, inputName });
        return this;
    }

    /**
     * Update activation based on usage
     */
    updateActivation(delta) {
        this.activationLevel = Math.max(0, Math.min(1, this.activationLevel + delta));
    }

    /**
     * Learn from feedback
     */
    async learn(feedback, context = {}) {
        // Override in subclasses
        return { updated: false };
    }

    /**
     * Get primitive info
     */
    getInfo() {
        return {
            name: this.config.name,
            type: this.config.type,
            activation: this.activationLevel,
            connections: Array.from(this.connections.keys())
        };
    }
}

/**
 * Perception Primitive
 * Extracts features and symbols from observations.
 */
export class PerceptionPrimitive extends CognitivePrimitive {
    constructor(config = {}) {
        super({
            ...config,
            type: 'perception',
            inputs: ['observation'],
            outputs: ['features', 'symbols']
        });
        
        this.featureExtractors = config.featureExtractors ?? [];
        this.symbolThreshold = config.symbolThreshold ?? 0.5;
        this.tensorBridge = new TensorLogicBridge();
    }

    async process(input, context = {}) {
        const observation = input.observation ?? input;
        
        // Extract features
        const features = await this._extractFeatures(observation);
        
        // Lift to symbols
        const symbols = this._liftToSymbols(features);
        
        this.updateActivation(0.1);
        
        return { features, symbols, observation };
    }

    async _extractFeatures(observation) {
        const results = [];
        
        for (const extractor of this.featureExtractors) {
            try {
                const features = await extractor(observation);
                results.push(features);
            } catch (e) {
                console.warn('Feature extraction error:', e);
            }
        }
        
        if (results.length === 0) {
            // Default: treat as tensor
            const data = Array.isArray(observation) 
                ? new Float32Array(observation) 
                : new Float32Array([observation]);
            results.push(new SymbolicTensor(data, [data.length]));
        }
        
        return results.length === 1 ? results[0] : results;
    }

    _liftToSymbols(features) {
        if (features instanceof SymbolicTensor) {
            return this.tensorBridge.liftToSymbols(features, {
                threshold: this.symbolThreshold
            });
        }
        
        // Auto-lift array features
        if (Array.isArray(features) || features?.data) {
            const data = features.data ?? features;
            const symbols = [];
            
            for (let i = 0; i < data.length; i++) {
                if (Math.abs(data[i]) >= this.symbolThreshold) {
                    symbols.push({
                        index: i,
                        symbol: `f${i}_${data[i] > 0 ? 'pos' : 'neg'}`,
                        value: data[i],
                        confidence: Math.abs(data[i])
                    });
                }
            }
            
            return symbols;
        }
        
        return [];
    }

    async learn(feedback, context = {}) {
        // Adjust symbol threshold based on feedback
        if (feedback.symbolAccuracy !== undefined) {
            const delta = (feedback.symbolAccuracy - 0.7) * this.learningRate;
            this.symbolThreshold = Math.max(0.1, Math.min(0.9, this.symbolThreshold + delta));
        }
        
        return { updated: true, symbolThreshold: this.symbolThreshold };
    }
}

/**
 * Reasoning Primitive
 * Performs symbolic reasoning and inference.
 */
export class ReasoningPrimitive extends CognitivePrimitive {
    constructor(config = {}) {
        super({
            ...config,
            type: 'reasoning',
            inputs: ['symbols', 'beliefs'],
            outputs: ['inferences', 'conclusions']
        });
        
        this.inferenceDepth = config.inferenceDepth ?? 3;
        this.beliefBase = new Map();
        this.inferenceHistory = [];
    }

    async process(input, context = {}) {
        const { symbols = [], beliefs = [] } = input;
        
        // Update belief base
        this._updateBeliefs(symbols);
        
        // Perform inference
        const inferences = await this._performInference(context);
        
        // Draw conclusions
        const conclusions = this._drawConclusions(inferences);
        
        this.updateActivation(0.15);
        
        return { inferences, conclusions, beliefs: new Map(this.beliefBase) };
    }

    _updateBeliefs(symbols) {
        for (const symbol of symbols) {
            const key = symbol.symbol ?? `f${symbol.index}`;
            const existing = this.beliefBase.get(key);
            
            if (existing) {
                // Belief revision
                existing.confidence = (existing.confidence + symbol.confidence) / 2;
                existing.timestamp = Date.now();
            } else {
                this.beliefBase.set(key, {
                    ...symbol,
                    timestamp: Date.now()
                });
            }
        }
        
        // Decay old beliefs
        const now = Date.now();
        for (const [key, belief] of this.beliefBase) {
            const age = (now - belief.timestamp) / 60000; // minutes
            belief.confidence *= Math.exp(-age * 0.05);
            if (belief.confidence < 0.1) {
                this.beliefBase.delete(key);
            }
        }
    }

    async _performInference(context) {
        const inferences = [];
        
        // Transitive inference
        const beliefs = Array.from(this.beliefBase.values());
        for (let i = 0; i < beliefs.length; i++) {
            for (let j = i + 1; j < beliefs.length; j++) {
                if (this._canCombine(beliefs[i], beliefs[j])) {
                    inferences.push({
                        type: 'transitive',
                        from: [beliefs[i].symbol, beliefs[j].symbol],
                        result: this._combineBeliefs(beliefs[i], beliefs[j]),
                        confidence: (beliefs[i].confidence + beliefs[j].confidence) / 2
                    });
                }
            }
        }
        
        this.inferenceHistory.push(...inferences);
        if (this.inferenceHistory.length > 100) {
            this.inferenceHistory.shift();
        }
        
        return inferences;
    }

    _canCombine(b1, b2) {
        // Simple heuristic: can combine if they share structure
        return b1.symbol?.split('_')[0] === b2.symbol?.split('_')[0];
    }

    _combineBeliefs(b1, b2) {
        return {
            symbol: `${b1.symbol}_${b2.symbol}`,
            confidence: (b1.confidence + b2.confidence) / 2,
            value: (b1.value ?? 0) + (b2.value ?? 0)
        };
    }

    _drawConclusions(inferences) {
        const conclusions = [];
        
        // High confidence inferences become conclusions
        for (const inf of inferences) {
            if (inf.confidence >= 0.7) {
                conclusions.push({
                    type: 'conclusion',
                    content: inf.result,
                    confidence: inf.confidence,
                    basis: inf.from
                });
            }
        }
        
        return conclusions;
    }

    async learn(feedback, context = {}) {
        if (feedback.inferenceAccuracy !== undefined) {
            this.learningRate = Math.max(0.001, Math.min(0.1, 
                this.learningRate + (feedback.inferenceAccuracy - 0.7) * 0.01
            ));
        }
        
        return { updated: true, inferenceCount: this.inferenceHistory.length };
    }
}

/**
 * Action Selection Primitive
 * Selects hybrid actions (discrete + continuous simultaneously).
 */
export class ActionSelectionPrimitive extends CognitivePrimitive {
    constructor(config = {}) {
        super({
            ...config,
            type: 'action',
            inputs: ['conclusions', 'goals', 'state'],
            outputs: ['action']
        });
        
        this.actionSpace = config.actionSpace ?? null;
        this.selector = new HybridActionSelector({
            discreteStrategy: config.discreteStrategy ?? 'argmax',
            continuousStrategy: config.continuousStrategy ?? 'sample',
            temperature: config.temperature ?? 1.0
        });
        
        this.actionHistory = [];
        this.actionValues = new Map();
    }

    async process(input, context = {}) {
        const { conclusions = [], goals = [], state } = input;
        
        // Compute action values from conclusions and goals
        const neuralOutput = this._computeActionValues(conclusions, goals, state);

        // Set action values for selector
        if (this.actionSpace) {
            this.selector.setActionValues(neuralOutput, this.actionSpace);
        }

        // Select hybrid action
        const action = this.actionSpace 
            ? this.selector.select(this.actionSpace, {
                exploration: context.explorationRate ?? 0.1
            })
            : this._fallbackAction(context);

        // Record action
        this._recordAction(action, context);

        this.updateActivation(0.2);

        return { action, actionValues: neuralOutput };
    }

    _fallbackAction(context) {
        // Fallback action when no action space is configured
        const action = new StructuredAction();
        action.discrete('default', 0);
        action.continuous('default', 0);
        return action;
    }

    _computeActionValues(conclusions, goals, state) {
        // Compute action values based on conclusions and goals
        // This is a simplified placeholder for neural network output
        
        const discreteCount = this.actionSpace?.discreteCount ?? 2;
        const continuousDim = this.actionSpace?.continuousDim ?? 2;
        
        const values = [];
        
        // Discrete action values (logits for each discrete action)
        for (let i = 0; i < discreteCount; i++) {
            let value = 0;
            
            // Boost values based on conclusions
            for (const conclusion of conclusions) {
                if (conclusion.content?.value) {
                    value += conclusion.content.value * conclusion.confidence;
                }
            }
            
            // Boost values based on goals
            for (const goal of goals) {
                if (goal.preferredAction === i) {
                    value += 2.0;
                }
            }
            
            values.push(value);
        }
        
        // Continuous action values
        for (let i = 0; i < continuousDim; i++) {
            let value = 0;
            
            for (const conclusion of conclusions) {
                if (conclusion.content?.value) {
                    value += conclusion.content.value * conclusion.confidence * 0.5;
                }
            }
            
            values.push(value);
        }
        
        return values;
    }

    _recordAction(action, context) {
        this.actionHistory.push({
            action: action.toJSON(),
            timestamp: Date.now(),
            context: {
                explorationRate: context.explorationRate,
                temperature: this.selector.config.temperature
            }
        });
        
        if (this.actionHistory.length > 1000) {
            this.actionHistory.shift();
        }
    }

    async learn(feedback, context = {}) {
        const { action, reward, nextState } = feedback;
        
        // Update action values based on reward
        if (action && reward !== undefined) {
            // Simple reward-based update
            for (const [name, comp] of Object.entries(action.components)) {
                const key = `${name}_${comp.value}`;
                const currentValue = this.actionValues.get(key) ?? 0;
                this.actionValues.set(key, currentValue + this.learningRate * reward);
            }
        }
        
        return { updated: true, actionCount: this.actionHistory.length };
    }

    getActionHistory(limit = 100) {
        return this.actionHistory.slice(-limit);
    }
}

/**
 * Memory Primitive
 * Stores and retrieves experiences.
 */
export class MemoryPrimitive extends CognitivePrimitive {
    constructor(config = {}) {
        super({
            ...config,
            type: 'memory',
            inputs: ['experience'],
            outputs: ['retrieved']
        });
        
        this.capacity = config.capacity ?? 10000;
        this.experiences = [];
        this.index = new Map();
    }

    async process(input, context = {}) {
        const { experience, query } = input;
        
        // Store experience
        if (experience) {
            this._storeExperience(experience);
        }
        
        // Retrieve relevant experiences
        let retrieved = [];
        if (query) {
            retrieved = this._retrieve(query, context);
        }
        
        this.updateActivation(0.05);
        
        return { retrieved, count: this.experiences.length };
    }

    _storeExperience(experience) {
        const exp = experience instanceof Experience 
            ? experience 
            : new Experience(experience);
        
        this.experiences.push(exp);
        
        // Index by tags
        for (const tag of exp.info.tags ?? []) {
            if (!this.index.has(tag)) {
                this.index.set(tag, []);
            }
            this.index.get(tag).push(this.experiences.length - 1);
        }
        
        // Prune if over capacity
        if (this.experiences.length > this.capacity) {
            this.experiences.shift();
            this._rebuildIndex();
        }
    }

    _retrieve(query, context) {
        const { tags, limit = 10, recency = true } = context;
        
        let candidates = this.experiences;
        
        // Filter by tags
        if (tags) {
            const indices = new Set();
            for (const tag of tags) {
                const tagged = this.index.get(tag) ?? [];
                for (const idx of tagged) indices.add(idx);
            }
            candidates = this.experiences.filter((_, i) => indices.has(i));
        }
        
        // Sort by recency
        if (recency) {
            candidates = [...candidates].sort((a, b) => b.info.timestamp - a.info.timestamp);
        }
        
        return candidates.slice(0, limit);
    }

    _rebuildIndex() {
        this.index.clear();
        for (let i = 0; i < this.experiences.length; i++) {
            const exp = this.experiences[i];
            for (const tag of exp.info.tags ?? []) {
                if (!this.index.has(tag)) {
                    this.index.set(tag, []);
                }
                this.index.get(tag).push(i);
            }
        }
    }

    async learn(feedback, context = {}) {
        // Prioritize successful experiences
        if (feedback.priorityUpdate) {
            const { indices, priorities } = feedback.priorityUpdate;
            for (let i = 0; i < indices.length; i++) {
                const idx = indices[i];
                if (idx < this.experiences.length) {
                    this.experiences[idx].info.priority = priorities[i];
                }
            }
        }
        
        return { updated: true, experienceCount: this.experiences.length };
    }

    getExperiences(limit = 100) {
        return this.experiences.slice(-limit);
    }

    getSuccessfulEpisodes(limit = 50) {
        return this.experiences
            .filter(e => e.info.success ?? e.reward > 0)
            .slice(-limit);
    }
}

/**
 * Emergent Cognitive Architecture
 * Self-organizing system where cognitive primitives interact.
 */
export class EmergentCognitiveArchitecture extends Component {
    constructor(config = {}) {
        super({
            name: config.name ?? 'EmergentCognition',
            primitives: config.primitives ?? [],
            connectionStrength: config.connectionStrength ?? 0.5,
            emergenceThreshold: config.emergenceThreshold ?? 0.3,
            ...config
        });
        
        this.primitives = new Map();
        this.globalState = new Map();
        this.emergentPatterns = [];
        
        // Add default primitives
        this._addDefaultPrimitives();
    }

    _addDefaultPrimitives() {
        // Perception
        this.addPrimitive('perception', new PerceptionPrimitive({
            name: 'perception',
            featureExtractors: []
        }));
        
        // Reasoning
        this.addPrimitive('reasoning', new ReasoningPrimitive({
            name: 'reasoning',
            inferenceDepth: 3
        }));
        
        // Action
        this.addPrimitive('action', new ActionSelectionPrimitive({
            name: 'action',
            actionSpace: this.config.actionSpace
        }));
        
        // Memory
        this.addPrimitive('memory', new MemoryPrimitive({
            name: 'memory',
            capacity: 10000
        }));
    }

    /**
     * Add a primitive
     */
    addPrimitive(name, primitive) {
        this.primitives.set(name, primitive);
        primitive.parent = this;
        this.emit('primitiveAdded', { name, primitive });
        return this;
    }

    /**
     * Connect primitives
     */
    connect(fromPrimitive, outputName, toPrimitive, inputName) {
        const from = this.primitives.get(fromPrimitive);
        const to = this.primitives.get(toPrimitive);
        
        if (!from || !to) {
            throw new Error(`Primitive not found: ${fromPrimitive} or ${toPrimitive}`);
        }
        
        from.connect(outputName, to, inputName);
        this.emit('primitivesConnected', { from: fromPrimitive, to: toPrimitive });
        
        return this;
    }

    /**
     * Process observation through emergent cognition
     */
    async process(observation, context = {}) {
        const { goals = [], explorationRate = 0.1 } = context;
        
        // Store in global state
        this.globalState.set('observation', observation);
        this.globalState.set('goals', goals);
        this.globalState.set('explorationRate', explorationRate);
        
        // Activate primitives based on input
        const activations = await this._activatePrimitives(observation, context);
        
        // Detect emergent patterns
        const patterns = this._detectEmergentPatterns(activations);
        
        // Store emergent patterns
        if (patterns.length > 0) {
            this.emergentPatterns.push(...patterns);
            if (this.emergentPatterns.length > 100) {
                this.emergentPatterns.shift();
            }
        }
        
        // Get final action
        const actionPrimitive = this.primitives.get('action');
        const actionResult = actionPrimitive 
            ? await actionPrimitive.process({
                conclusions: activations.reasoning?.conclusions ?? [],
                goals,
                state: observation
            }, { explorationRate })
            : { action: null };
        
        return {
            action: actionResult.action,
            activations,
            emergentPatterns: patterns,
            globalState: Object.fromEntries(this.globalState)
        };
    }

    async _activatePrimitives(observation, context) {
        const results = {};
        
        // Perception first
        const perception = this.primitives.get('perception');
        if (perception) {
            results.perception = await perception.process({ observation }, context);
        }
        
        // Reasoning based on perception
        const reasoning = this.primitives.get('reasoning');
        if (reasoning && results.perception) {
            results.reasoning = await reasoning.process({
                symbols: results.perception.symbols ?? [],
                beliefs: []
            }, context);
        }
        
        // Memory retrieval
        const memory = this.primitives.get('memory');
        if (memory) {
            results.memory = await memory.process({
                experience: {
                    state: observation,
                    action: null,
                    reward: 0,
                    nextState: null,
                    done: false
                }
            }, {
                query: true,
                tags: ['recent'],
                limit: 5
            });
        }
        
        return results;
    }

    _detectEmergentPatterns(activations) {
        const patterns = [];
        
        // Check for co-activation patterns
        const activePrimitives = [];
        for (const [name, result] of Object.entries(activations)) {
            const primitive = this.primitives.get(name);
            if (primitive?.activationLevel >= this.config.emergenceThreshold) {
                activePrimitives.push({
                    name,
                    activation: primitive.activationLevel,
                    output: result
                });
            }
        }
        
        // Detect pattern if multiple primitives are highly active
        if (activePrimitives.length >= 2) {
            patterns.push({
                type: 'co-activation',
                primitives: activePrimitives.map(p => p.name),
                strength: activePrimitives.reduce((sum, p) => sum + p.activation, 0) / activePrimitives.length,
                timestamp: Date.now()
            });
        }
        
        // Check for conclusion-action coupling
        if (activations.reasoning?.conclusions?.length > 0) {
            patterns.push({
                type: 'reasoning-driven',
                conclusionCount: activations.reasoning.conclusions.length,
                avgConfidence: activations.reasoning.conclusions.reduce(
                    (sum, c) => sum + c.confidence, 0
                ) / activations.reasoning.conclusions.length,
                timestamp: Date.now()
            });
        }
        
        return patterns;
    }

    /**
     * Learn from experience
     */
    async learn(transition, reward, context = {}) {
        const results = {};
        
        // Learn in all primitives
        for (const [name, primitive] of this.primitives) {
            if (primitive.learn) {
                results[name] = await primitive.learn({
                    ...transition,
                    reward
                }, context);
            }
        }
        
        // Store experience in memory
        const memory = this.primitives.get('memory');
        if (memory) {
            memory._storeExperience(new Experience({
                ...transition,
                reward,
                info: {
                    timestamp: Date.now(),
                    tags: reward > 0 ? ['positive', 'successful'] : ['negative']
                }
            }));
        }
        
        return results;
    }

    /**
     * Act in environment
     */
    async act(observation, context = {}) {
        const result = await this.process(observation, context);
        return result.action;
    }

    /**
     * Get architecture state
     */
    getState() {
        const primitiveStates = {};
        for (const [name, primitive] of this.primitives) {
            primitiveStates[name] = primitive.getInfo();
        }
        
        return {
            primitives: primitiveStates,
            globalState: Object.fromEntries(this.globalState),
            emergentPatterns: this.emergentPatterns.slice(-10)
        };
    }

    /**
     * Get action space
     */
    getActionSpace() {
        const actionPrimitive = this.primitives.get('action');
        return actionPrimitive?.actionSpace ?? null;
    }

    async onShutdown() {
        for (const primitive of this.primitives.values()) {
            await primitive.shutdown();
        }
        this.primitives.clear();
        this.globalState.clear();
        this.emergentPatterns = [];
    }
}

/**
 * Factory for creating emergent architectures
 */
export class EmergentArchitectureFactory {
    static create(config = {}) {
        return new EmergentCognitiveArchitecture(config);
    }

    static createForHybridAction(hybridActionSpace, options = {}) {
        return new EmergentCognitiveArchitecture({
            ...options,
            actionSpace: hybridActionSpace,
            primitives: [
                new PerceptionPrimitive({ name: 'perception' }),
                new ReasoningPrimitive({ name: 'reasoning', inferenceDepth: 5 }),
                new ActionSelectionPrimitive({ 
                    name: 'action',
                    actionSpace: hybridActionSpace,
                    discreteStrategy: 'softmax',
                    continuousStrategy: 'sample'
                }),
                new MemoryPrimitive({ name: 'memory', capacity: 50000 })
            ]
        });
    }

    static createMinimal() {
        return new EmergentCognitiveArchitecture({
            name: 'MinimalEmergent',
            emergenceThreshold: 0.5
        });
    }

    static createComplex(options = {}) {
        return new EmergentCognitiveArchitecture({
            name: 'ComplexEmergent',
            emergenceThreshold: 0.2,
            connectionStrength: 0.8,
            ...options
        });
    }
}
