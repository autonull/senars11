# RL Module Quick Reference Guide

## Core Concepts

### Component Lifecycle

All major components extend `Component` base class:

```javascript
import { Component } from '@senars/rl';

class MyComponent extends Component {
    constructor(config = {}) {
        super(config); // Always call super with config
    }
    
    async onInitialize() {
        // Called during initialize()
        // Setup resources, connections, etc.
    }
    
    async onShutdown() {
        // Called during shutdown()
        // Cleanup resources
    }
}

// Usage
const comp = new MyComponent();
await comp.initialize();
// ... use component ...
await comp.shutdown();
```

### Configuration Pattern

```javascript
import { mergeConfig, createConfig, ConfigSchema } from '@senars/rl';

const DEFAULTS = {
    learningRate: 0.001,
    capacity: 10000,
    mode: 'online'
};

class MyModule extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
    }
}

// With validation
const schema = {
    learningRate: ConfigSchema.positiveNumber(),
    mode: ConfigSchema.oneOf(['online', 'offline', 'batch'])
};

const validated = createConfig(schema, { learningRate: 0.01, mode: 'online' });
```

---

## Skills System

### Creating Skills

```javascript
import { Skill, SkillDiscovery, SkillManager } from '@senars/rl';

// Basic skill
const skill = new Skill('my_skill', {
    precondition: (obs) => obs[0] > 0.5,
    termination: (obs) => obs[0] < 0.1,
    policy: async (obs, ctx, skill) => {
        return action;
    }
});

// Hierarchical skill
const parent = new Skill('parent');
parent.addSubSkill('child1', childSkill1);
parent.addSubSkill('child2', childSkill2);

// Skill with learning
await skill.initialize();
const action = await skill.act(observation, context);
await skill.learn(reward, done);
```

### Skill Discovery

```javascript
import { SkillDiscovery } from '@senars/rl';

const discovery = new SkillDiscovery({
    minSupport: 5,           // Min experiences to form skill
    similarityThreshold: 0.8, // Novelty threshold
    maxLevels: 4             // Hierarchy depth
});

await discovery.initialize();

// Discover from experiences
const newSkills = await discovery.discoverSkills(experiences, {
    incremental: true,
    consolidate: false
});

// Get discovered skills
const skills = discovery.getSkillsAtLevel(1);
const primitives = discovery.getPrimitiveSkills();
const composites = discovery.getCompositeSkills();

// Export/import
const mettaStr = discovery.exportToMetta();
discovery.importFromMetta(mettaStr, policyMap);
```

### Skill Library

```javascript
import { SkillLibrary } from '@senars/rl';

const library = new SkillLibrary({
    capacity: 100,
    similarityThreshold: 0.8,
    retrievalStrategy: 'relevance'
});

// Register skills
library.register('navigate', navigateSkill);
library.register('grasp', graspSkill);

// Retrieve applicable skills
const candidates = library.retrieve(
    { observation, goal },
    { maxResults: 5, minSuccessRate: 0.6 }
);

// Get specific skill
const skill = library.get('navigate');
```

---

## Experience Systems

### Experience Buffer (Causal, Prioritized)

```javascript
import { ExperienceBuffer, CausalExperience } from '@senars/rl';

const buffer = new ExperienceBuffer({
    capacity: 100000,
    batchSize: 32,
    sampleStrategy: 'prioritized', // 'random', 'causal', 'recent'
    useCausalIndexing: true
});

await buffer.initialize();

// Store experiences
const exp = new CausalExperience({
    state, action, reward, nextState, done
});
await buffer.store(exp);

// Sample batch
const batch = await buffer.sample(32, {
    strategy: 'prioritized',
    causalQuery: queryState
});

// Distributed training
buffer.registerWorker('worker-1');
await buffer.receiveFromWorker('worker-1', experiences);
await buffer.aggregateWorkers();

// Stats
const stats = buffer.getStats();
```

### Experience Store (Episode-based)

```javascript
import { ExperienceStore, Experience, Episode } from '@senars/rl';

const store = new ExperienceStore({
    capacity: 100000,
    priorityReplay: true,
    nStep: 1
});

// Record episode
store.startEpisode({ env: 'CartPole' });
store.record(state, action, reward, nextState, done);
// ... more steps ...
const episode = store.finalizeEpisode();

// Query experiences
const stream = store.query({
    tags: ['successful'],
    minReward: 50,
    limit: 100
});

const experiences = stream
    .filter(exp => exp.reward > 0)
    .take(10)
    .collect();

// Sample
const batch = store.sample(32, { prioritized: true });

// Get successful episodes
const successful = store.getSuccessfulEpisodes(100);
```

### Shared Data Structures

```javascript
import { SumTree, PrioritizedBuffer, CircularBuffer, Index } from '@senars/rl';

// SumTree for prioritized replay
const tree = new SumTree(10000);
tree.update(idx, priority);
const idx = tree.find(value);
const samples = tree.sample(32);

// PrioritizedBuffer (high-level)
const buffer = new PrioritizedBuffer(10000);
buffer.add(item, priority=0.8);
const samples = buffer.sample(32);
buffer.updatePriority(idx, newPriority);

// CircularBuffer (fixed-size)
const recent = new CircularBuffer(100);
recent.push(state);
const last10 = recent.slice(-10);
const filtered = recent.filter(s => s > 0.5);

// Index (multi-key)
const index = new Index();
index.add('tag1', 'exp1');
index.add('tag2', 'exp1');
const results = index.query(['tag1', 'tag2']);
const stats = index.stats;
```

---

## Neuro-Symbolic Integration

### NeuroSymbolicBridge

```javascript
import { NeuroSymbolicBridge } from '@senars/rl';

const bridge = NeuroSymbolicBridge.create({
    useSeNARS: true,
    senarsConfig: {},
    mettaConfig: {},
    autoGround: true,
    maxReasoningCycles: 100
});

await bridge.initialize();

// Input beliefs
await bridge.inputNarsese('<room_1 --> clean>.');

// Ask questions
const result = await bridge.ask('<room_1 --> clean>?');

// Achieve goals
const plan = await bridge.achieveGoal('<all_rooms --> clean>!', {
    cycles: 100,
    imagination: true
});

// Perception-Reasoning-Action loop
const { action, reasoning, policy, symbolic } = await bridge.perceiveReasonAct(
    observation,
    { useNARS: true, useMeTTa: true, useTensor: true }
);

// Tensor ↔ Symbolic conversion
const tensor = bridge.narseseToTensor(narsese, [64]);
const symbols = bridge.liftToSymbols(tensor, { threshold: 0.5 });
const grounded = bridge.groundToTensor(symbols, [64]);

// Causal learning
await bridge.learnCausal({ state, action, nextState, reward });
const prediction = bridge.predictCausal(currentState, action);

await bridge.shutdown();
```

### TensorLogicPolicy

```javascript
import { TensorLogicPolicy } from '@senars/rl';

const policy = new TensorLogicPolicy({
    inputDim: 64,
    hiddenDim: 128,
    outputDim: 4,
    numLayers: 2,
    policyType: 'softmax',
    actionType: 'discrete',
    learningRate: 0.001
});

await policy.initialize();

// Forward pass
const { logits, hidden, intermediates } = policy.forward(state, {
    trackGradient: true,
    returnIntermediate: false
});

// Select action
const { action, actionProb, logits } = await policy.selectAction(state, {
    exploration: 0.1,
    deterministic: false
});

// Update from experience
const result = await policy.update(experience, {
    advantages: [0.5],
    returns: [10.0],
    oldProbs: [0.25, 0.25, 0.25, 0.25]
});

// Extract rules
const rules = policy.extractRules({ threshold: 0.5 });

// Get/set parameters
const params = policy.getParameters();
policy.setParameters(params);

await policy.shutdown();
```

---

## Architectures

### Architecture Builder

```javascript
import { 
    NeuroSymbolicArchitecture,
    ArchitectureBuilder,
    ArchitectureTemplates
} from '@senars/rl';

// Using builder
const architecture = await new ArchitectureBuilder()
    .withConfig({ architecture: 'dual-process' })
    .addPerceptionLayer({ units: 32, attention: true })
    .addReasoningLayer({ units: 64 })
    .addPlanningLayer({ units: 48 })
    .addActionLayer({ units: 16 })
    .chain()
    .withResidualConnections()
    .build();

await architecture.initialize();

// Process observation
const { output, activations } = await architecture.process(observation, {
    lift: true,
    ground: true,
    attend: true
});

// Act
const action = await architecture.act(observation, goal);

// Learn
await architecture.learn(transition, reward);

// Pre-built templates
const dualProcess = ArchitectureTemplates.dualProcess(config);
const hierarchical = ArchitectureTemplates.hierarchical(config);
const attention = ArchitectureTemplates.attention(config);
```

---

## Agents

### NeuroSymbolicAgent

```javascript
import { NeuroSymbolicAgent, GridWorld } from '@senars/rl';

const env = new GridWorld({ size: 5 });
const agent = new NeuroSymbolicAgent(env, {
    architecture: 'dual-process',
    reasoning: 'metta',
    planning: true,
    skillDiscovery: true
});

await agent.initialize();

// Act
const obs = env.reset().observation;
const action = await agent.act(obs, goal);

// Learn
await agent.learn(obs, action, reward, nextObs, done);

// Planning
const plan = await agent.plan(goal);

// Explanation
const explanation = await agent.explain(decision);

// Skill discovery
const skills = await agent.discoverSkills(experiences);
const composed = await agent.composeSkills(goal);

await agent.close();
```

### DQNAgent

```javascript
import { DQNAgent, CartPole } from '@senars/rl';

const env = new CartPole();
const agent = new DQNAgent(env, {
    gamma: 0.99,
    epsilon: 1.0,
    epsilonDecay: 0.995,
    learningRate: 0.001,
    hiddenSize: 64
});

await agent.initialize();

// Training loop
for (let episode = 0; episode < 1000; episode++) {
    let obs = env.reset().observation;
    let done = false;
    
    while (!done) {
        const action = agent.act(obs);
        const { observation, reward, terminated, truncated } = env.step(action);
        done = terminated || truncated;
        
        await agent.learn(obs, action, reward, observation, done);
        obs = observation;
    }
}

await agent.close();
```

### PPOAgent

```javascript
import { PPOAgent } from '@senars/rl';

const agent = new PPOAgent(env, {
    gamma: 0.99,
    lambda: 0.95,
    epsilonClip: 0.2,
    learningRate: 0.0003,
    hiddenSize: 64,
    epochs: 4
});

await agent.initialize();
// ... use like DQNAgent ...
```

---

## Environments

### Standard Interface

```javascript
import { GridWorld, CartPole, CompositionalWorld } from '@senars/rl';

const env = new GridWorld({
    size: 5,
    start: [0, 0],
    goal: [4, 4],
    obstacles: [[2, 2], [3, 3]]
});

// Reset
const { observation, info } = env.reset();

// Step
const { observation, reward, terminated, truncated, info } = env.step(action);

// Spaces
const obsSpace = env.observationSpace;  // { type, shape, low, high }
const actSpace = env.actionSpace;       // { type, n } or { type, shape, low, high }

// Render (if supported)
env.render();

// Close
env.close();
```

---

## Utilities

### ConfigHelper

```javascript
import { mergeConfig, createConfig, ConfigSchema, validateConfig } from '@senars/rl';

// Simple merge
const config = mergeConfig(DEFAULTS, overrides);

// With validation
const schema = {
    learningRate: ConfigSchema.positiveNumber(),
    mode: ConfigSchema.oneOf(['a', 'b']),
    capacity: ConfigSchema.number(100, 100000)
};

const { valid, errors } = validateConfig(config, schema);
const validated = createConfig(schema, overrides);

// Extract subset
const subset = extractConfig(config, ['learningRate', 'gamma']);

// With defaults
const withDefaults = withDefaults(config, defaults);
```

### ErrorHandler

```javascript
import { NeuroSymbolicError, handleError } from '@senars/rl';

// Custom error
throw NeuroSymbolicError.component('bridge', 'SeNARS not available');

// Wrap error
try {
    // ...
} catch (e) {
    throw NeuroSymbolicError.wrap(e, 'Operation failed', { context });
}

// Handle and log
const error = handleError(e, { operation: 'ask' }, console);
```

### MetricsTracker

```javascript
import { MetricsTracker } from '@senars/rl';

const metrics = new MetricsTracker({
    updates: 0,
    totalLoss: 0
});

metrics.increment('updates');
metrics.set('totalLoss', 0.5);

const value = metrics.get('updates');
const all = metrics.getAll();
const stats = metrics.getStats('totalLoss');

metrics.reset('updates'); // or reset() for all
```

### NarseseUtils

```javascript
import { NarseseUtils } from '@senars/rl';

// Transformations
const metta = NarseseUtils.toMetta('<A --> B>.');
const narsese = NarseseUtils.toNarsese('(implies A B)');

// Observation/Action/Goal
const obsNarsese = NarseseUtils.observationToNarsese([0.1, 0.9], 'obs');
const actionNarsese = NarseseUtils.actionToNarsese(2, 'op');
const goalNarsese = NarseseUtils.goalToNarsese({ clean: true });

// Parse
const parsed = NarseseUtils.parseQuestion('<A --> B>?');
const operation = NarseseUtils.parseOperation('^op_2');
```

### PolicyUtils

```javascript
import { PolicyUtils, ParameterInitializer } from '@senars/rl';

// Array operations
const idx = PolicyUtils.argmax([0.1, 0.7, 0.2]);  // 1
const sample = PolicyUtils.sampleCategorical([0.2, 0.6, 0.2]);
const gaussian = PolicyUtils.sampleGaussian();
const pdf = PolicyUtils.gaussianPdf(x, mu, std);

// Pattern finding
const patterns = PolicyUtils.findStateActionPatterns(pairs);

// Initializers
const initFn = ParameterInitializer.xavier(fanIn, fanOut);
```

### NetworkBuilder

```javascript
import { NetworkBuilder } from '@senars/rl';

// Build MLP
const mlp = NetworkBuilder.buildMLP(
    inputDim=64,
    hiddenDim=128,
    outputDim=10,
    numLayers=2
);

// Forward pass
const output = NetworkBuilder.forward(mlp, input);

// Utilities
const action = NetworkBuilder.sampleAction(probs);
const mask = NetworkBuilder.createActionMask(actions, actionDim, batchSize);
const { advantages, returns } = NetworkBuilder.computeGAE(
    values, rewards, dones, gamma, lambda, lastNextVal
);
```

---

## Component System

### Creating Components

```javascript
import { Component, ComponentRegistry, CompositionEngine } from '@senars/rl';

// Define component
class MyProcessor extends Component {
    async onInitialize() {
        this.setState('ready', true);
    }
    
    async process(input) {
        return input * 2;
    }
}

// Register
const registry = new ComponentRegistry();
registry.register('processor', MyProcessor);

// Create
const processor = registry.create('processor', { config });
await processor.initialize();

// Compose
const engine = new CompositionEngine();
engine.createPipeline('my-pipeline', [
    { id: 'step1', component: sensor },
    { id: 'step2', component: processor },
    { id: 'step3', component: actuator }
]);

const result = await engine.execute('my-pipeline', input);
```

### Component Features

```javascript
// State management
component.setState('key', value);
const value = component.getState('key');
const all = component.getAllState();

// Event system
const sub = component.subscribe('event', (data, source) => {
    // Handle event
});
component.emit('event', { data });
component.unsubscribe(sub);

// Child management
component.add('child', childComponent);
component.remove('child');
const child = component.get('child');
const has = component.has('child');

// Metrics
const metrics = component.getMetrics();

// Serialization
const serialized = component.serialize();
const clone = component.clone({ overrides });
```

---

## Quick Start Examples

### Minimal RL Agent

```javascript
import { RLAgent, RLEnvironment } from '@senars/rl';

class SimpleAgent extends RLAgent {
    act(obs) {
        return Math.floor(Math.random() * this.env.actionSpace.n);
    }
    
    learn(obs, action, reward, nextObs, done) {
        // Update policy
    }
}

const env = new GridWorld();
const agent = new SimpleAgent(env);

// Run episode
let obs = env.reset().observation;
let done = false;
while (!done) {
    const action = agent.act(obs);
    const { observation, reward, terminated, truncated } = env.step(action);
    agent.learn(obs, action, reward, observation, terminated || truncated);
    obs = observation;
    done = terminated || truncated;
}
```

### Neuro-Symbolic Demo

```javascript
import { 
    NeuroSymbolicBridge,
    TensorLogicPolicy,
    SkillDiscovery,
    ExperienceBuffer
} from '@senars/rl';

// Initialize components
const bridge = NeuroSymbolicBridge.createBalanced();
const policy = TensorLogicPolicy.createDiscrete(64, 4);
const skills = SkillDiscovery.create({ minSupport: 5 });
const buffer = ExperienceBuffer.createPrioritized(10000);

await Promise.all([
    bridge.initialize(),
    policy.initialize(),
    skills.initialize(),
    buffer.initialize()
]);

// Training loop
for (let episode = 0; episode < 100; episode++) {
    // Collect experience
    // Learn with policy
    // Discover skills
    // Reason with bridge
}

await Promise.all([
    bridge.shutdown(),
    policy.shutdown(),
    skills.shutdown(),
    buffer.shutdown()
]);
```

---

## Error Handling Best Practices

```javascript
import { NeuroSymbolicError, handleError } from '@senars/rl';

// 1. Use specific error types
throw NeuroSymbolicError.configuration('learningRate', -0.1, 'positive number');

// 2. Wrap external errors
try {
    await externalCall();
} catch (e) {
    throw NeuroSymbolicError.wrap(e, 'External call failed', { url });
}

// 3. Handle gracefully
try {
    await riskyOperation();
} catch (e) {
    handleError(e, { operation: 'riskyOperation' });
    // Continue with fallback
}

// 4. Component errors
try {
    await this.bridge.ask(question);
} catch (e) {
    this.emit('error', { source: 'bridge', error: e });
    return null; // Fallback
}
```

---

## Performance Tips

1. **Reuse buffers**: Create once, clear/reuse instead of recreating
2. **Batch operations**: Use `storeBatch()` instead of multiple `store()`
3. **Limit history**: Set appropriate capacity limits
4. **Use TypedArrays**: DataStructures use Float64Array for efficiency
5. **Cache results**: Use inference cache in NeuroSymbolicBridge
6. **Sample efficiently**: Use appropriate sampling strategies

---

This guide covers the main patterns and APIs. For more details, see the source files and inline JSDoc comments.
