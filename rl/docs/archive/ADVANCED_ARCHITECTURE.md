# Neuro-Symbolic RL Framework - Advanced Architecture Guide

## Overview

This document describes the advanced neuro-symbolic RL capabilities for building **self-improving, general-purpose
cognitive systems**. The framework provides fine-grained, composable components that enable versatile self-modifying
architectures.

## Architecture Philosophy

### Design Principles

1. **Fine-Grained Composition**: All components are modular and can be freely combined
2. **Self-Modification**: Architectures can evolve and adapt during learning
3. **Neuro-Symbolic Integration**: Seamless bridge between neural networks and symbolic reasoning
4. **Hierarchical Organization**: Multi-level abstraction for skills and planning
5. **Distributed Scaling**: Parallel execution across workers and machines

## Component System

### Base Component

All components extend the `Component` base class which provides:

- Lifecycle management (`initialize`, `shutdown`)
- Parent-child composition
- Event system with subscriptions
- State management
- Metrics tracking
- Serialization/deserialization

```javascript
import { Component } from '@senars/rl';

class MyComponent extends Component {
    async onInitialize() {
        // Custom initialization
    }
    
    async onShutdown() {
        // Cleanup resources
    }
}
```

### Component Registry

Dynamic component discovery and instantiation:

```javascript
import { ComponentRegistry, globalRegistry } from '@senars/rl';

// Register component
globalRegistry.register('myComponent', MyComponent, {
    aliases: ['mc'],
    dependencies: ['logger', 'config'],
    version: '1.0.0',
    description: 'My custom component'
});

// Create instance
const component = globalRegistry.create('myComponent', { /* config */ });

// Create with dependencies resolved
const component = globalRegistry.createWithDependencies('myComponent');
```

### Composition Engine

Build and execute component pipelines:

```javascript
import { CompositionEngine, PipelineBuilder } from '@senars/rl';

const engine = new CompositionEngine();

// Create pipeline
engine.createPipeline('perception-action', [
    { id: 'perceive', component: perceptionModule },
    { id: 'reason', component: reasoningModule },
    { id: 'act', component: actionModule }
]);

// Execute
const result = await engine.execute('perception-action', observation);

// Fluent builder API
const builder = new PipelineBuilder(engine);
await builder
    .named('sense-think-act')
    .add(sensorModule)
    .add(reasoningModule)
    .when(condition, optionalModule)
    .add(actuatorModule)
    .run(input);
```

## Self-Modifying Architectures

### MetaController

The `MetaController` enables architectures that modify themselves during learning:

```javascript
import { MetaController } from '@senars/rl';

const metaController = new MetaController({
    metaLearningRate: 0.1,
    explorationRate: 0.3,
    modificationThreshold: 0.5,
    evaluationWindow: 100
});

// Set initial architecture
metaController.setArchitecture({
    stages: [
        { id: 'perception', component: visionModule },
        { id: 'reasoning', component: senarsBridge },
        { id: 'action', component: policyModule }
    ]
});

// Meta-controller will automatically propose and apply modifications
// based on performance evaluation
```

### Architecture Evolver

Population-based architecture search:

```javascript
import { ArchitectureEvolver } from '@senars/rl';

const evolver = new ArchitectureEvolver({
    populationSize: 10,
    elitismRate: 0.2,
    mutationRate: 0.3,
    crossoverRate: 0.5
});

// Initialize population
evolver.initializePopulation(baseArchitecture);

// After each generation
for (const individual of evolver.population) {
    const fitness = await evaluate(individual.architecture);
    evolver.updateFitness(individual.architecture, fitness);
}

// Get best architecture
const bestArchitecture = evolver.evolve();
```

## Neuro-Symbolic Primitives

### Tensor-Logic Bridge

Bidirectional conversion between tensors and symbolic representations:

```javascript
import { 
    SymbolicTensor, 
    TensorLogicBridge,
    symbolicTensor 
} from '@senars/rl';

const bridge = new TensorLogicBridge();

// Create symbolic tensor
const tensor = symbolicTensor(
    new Float32Array([0.8, 0.2, 0.9, 0.1]),
    [2, 2],
    { '0,0': 'goal_visible', '1,1': 'obstacle_near' }
);

// Lift to symbols
const symbols = bridge.liftToSymbols(tensor, { threshold: 0.5 });

// Ground symbols to tensor
const grounded = bridge.groundToTensor(symbols, [4]);

// Symbolic operations
const result = bridge.symbolicAdd(tensor1, tensor2, 'union');

// Extract rules
const rules = bridge.extractRules(tensor, 0.7);
```

### World Model

Learn dynamics models for imagination-based planning:

```javascript
import { WorldModel } from '@senars/rl';

const worldModel = new WorldModel({
    modelType: 'neural-symbolic',
    horizon: 10,
    latentDim: 32,
    ensembleSize: 3,
    uncertaintyThreshold: 0.5
});

await worldModel.initialize();

// Train on experience
await worldModel.train(transitions, 100);

// Predict future states
const { predictions, uncertainties, horizon } = worldModel.predict(
    currentState,
    action,
    5  // horizon
);

// Imagine trajectory
const imagination = worldModel.imagine(initialState, [
    action1, action2, action3
]);

// Get symbolic rules learned by world model
const rules = worldModel.getSymbolicRules();
```

### Symbolic Differentiation

Explainable gradient-based learning:

```javascript
import { SymbolicDifferentiation } from '@senars/rl';

const diff = new SymbolicDifferentiation({
    trackProvenance: true,
    symbolicThreshold: 0.3
});

// Compute gradients with symbolic tracking
const gradients = diff.gradient(loss, parameters, context);

// Explain gradients
const explanation = diff.explainGradient(paramTensor);
console.log(explanation.explanation);
// "Top influences: ∂goal_visible(0.234), ∂obstacle_near(-0.156)"

// Analyze gradient flow
const analysis = diff.analyzeGradientFlow();
console.log(analysis);
// { vanishingGradients: 2, explodingGradients: 0, avgMagnitude: 0.45 }
```

## Hierarchical Skill System

### Skill Class

Define reusable skills with preconditions and termination:

```javascript
import { Skill } from '@senars/rl';

const navigateToGoal = new Skill('navigate', {
    abstractionLevel: 1,
    precondition: (obs) => obs.goal_visible && !obs.at_goal,
    termination: (obs) => obs.at_goal,
    policy: async (obs, ctx, skill) => {
        // Navigate towards goal
        return computeNavigationAction(obs);
    }
});

// Add sub-skills
navigateToGoal.addSubSkill('avoid_obstacles', avoidObstaclesSkill);
navigateToGoal.addSubSkill('open_door', openDoorSkill);
```

### Skill Library

Store and retrieve skills:

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
const applicable = library.retrieve(
    { observation, context },
    { maxResults: 5, minSuccessRate: 0.6 }
);
```

### Skill Discovery Engine

Automatic skill discovery from experience:

```javascript
import { SkillDiscoveryEngine } from '@senars/rl';

const discovery = new SkillDiscoveryEngine({
    discoveryMode: 'online', // 'online', 'batch', 'curiosity'
    minUsageCount: 10,
    bottleneckThreshold: 0.3
});

// Process transitions
discovery.processTransition({ state, action, nextState, reward, done });

// Listen for discovered skills
discovery.subscribe('skillDiscovered', ({ skill, source }) => {
    console.log(`Discovered ${source} skill: ${skill.config.name}`);
    library.register(skill.config.name, skill);
});

// Get candidate skills
const candidates = discovery.getCandidateSkills();
```

## Distributed Execution

### Worker Pool

Parallel execution across workers:

```javascript
import { WorkerPool } from '@senars/rl';

const pool = new WorkerPool({
    numWorkers: 8,
    workerType: 'thread', // or 'process'
    workerTimeout: 30000
});

await pool.initialize();

// Submit tasks
const results = await Promise.all([
    pool.submit({ type: 'rollout', env: 'CartPole', policy, steps: 500 }),
    pool.submit({ type: 'rollout', env: 'CartPole', policy, steps: 500 }),
    pool.submit({ type: 'rollout', env: 'CartPole', policy, steps: 500 })
]);

// Get statistics
const stats = pool.getStats();
console.log(stats);
// { tasksCompleted: 100, avgExecutionTime: 45.2, ... }

// Scale dynamically
await pool.scale(16);

await pool.shutdown();
```

### Distributed Experience Buffer

Parallel experience collection:

```javascript
import { DistributedExperienceBuffer } from '@senars/rl';

const buffer = new DistributedExperienceBuffer({
    capacity: 100000,
    numBuffers: 4,
    batchSize: 32,
    sampleStrategy: 'prioritized'
});

await buffer.initialize();

// Add experiences from different workers
buffer.add({ state, action, reward, nextState, done }, workerId);

// Sample batches
const batch = buffer.sample(32);

// Get statistics
const stats = buffer.getStats();
```

### Parameter Server

Distributed training coordination:

```javascript
import { ParameterServer } from '@senars/rl';

const server = new ParameterServer({
    updateMode: 'async', // 'async', 'sync', 'semi_async'
    aggregationMethod: 'mean'
});

// Initialize parameters
server.initializeParameters({
    'policy/weights': { shape: [64, 32], initialValue: initialWeights },
    'policy/bias': { shape: [32] }
});

// Workers push gradients
server.pushGradients(gradients, workerId);

// Get updated parameters
const params = server.getParameters();
```

## Benchmarking & Evaluation

### Benchmark Runner

Systematic performance evaluation:

```javascript
import { BenchmarkRunner } from '@senars/rl';

const runner = new BenchmarkRunner({
    numEpisodes: 100,
    maxSteps: 1000,
    evaluationInterval: 10,
    metrics: ['reward', 'length', 'success']
});

await runner.initialize();

// Run benchmark
const results = await runner.run(agent, [
    { name: 'CartPole', config: {} },
    { name: 'GridWorld', config: { size: 10 } },
    { name: 'CompositionalWorld', config: { numObjects: 5 } }
]);

console.log(results);
// {
//   environments: {
//     CartPole: { reward: { mean: 195.4, std: 12.3 }, successRate: 0.85 },
//     ...
//   },
//   overall: { avgReward: 156.7, avgSuccessRate: 0.72 }
// }
```

### Metrics Collector

Real-time metric tracking:

```javascript
import { MetricsCollector } from '@senars/rl';

const metrics = new MetricsCollector({
    sampleRate: 1.0,
    windowSize: 100
});

// Record metrics
metrics.record('reward', 150.5, { episode: 42, env: 'CartPole' });
metrics.record('loss', 0.234, { step: 1000 });

// Get statistics
const stats = metrics.stats('reward');
console.log(stats);
// { mean: 145.2, std: 23.4, p50: 150, p90: 180, p99: 200 }

// Get aggregated metrics
const avgReward = metrics.aggregate('reward', 60000, 'mean');
```

### Comparative Evaluator

Statistical comparison of agents:

```javascript
import { ComparativeEvaluator } from '@senars/rl';

const evaluator = new ComparativeEvaluator({
    statisticalTest: 't-test',
    confidenceLevel: 0.95,
    numRuns: 30
});

// Compare two agents
const comparison = await evaluator.compare(
    agentA,
    agentB,
    environment,
    { numRuns: 50 }
);

console.log(comparison.statisticalTest);
// { tStat: 2.45, pValue: 0.016, significant: true, meanDiff: 23.4 }

console.log(comparison.effectSize);
// Cohen's d: 0.68 (medium effect)
```

## Complete Example: Self-Improving Agent

```javascript
import {
    NeuroSymbolicAgent,
    MetaController,
    WorldModel,
    SkillDiscoveryEngine,
    WorkerPool,
    BenchmarkRunner,
    CompositionalWorld
} from '@senars/rl';

// Create base agent
const agent = new NeuroSymbolicAgent(env, {
    architecture: 'dual-process',
    reasoning: 'metta',
    planning: true,
    skillDiscovery: true
});

// Create meta-controller for self-improvement
const metaController = new MetaController({
    metaLearningRate: 0.1,
    explorationRate: 0.3
});

// Create world model for imagination
const worldModel = new WorldModel({
    horizon: 10,
    ensembleSize: 3
});

// Create skill discovery engine
const skillDiscovery = new SkillDiscoveryEngine({
    discoveryMode: 'online'
});

// Create worker pool for parallel rollouts
const workerPool = new WorkerPool({ numWorkers: 8 });

// Initialize all components
await agent.initialize();
await metaController.initialize();
await worldModel.initialize();
await skillDiscovery.initialize();
await workerPool.initialize();

// Set initial architecture
metaController.setArchitecture({
    stages: [
        { id: 'perception', component: agent.grounding },
        { id: 'world_model', component: worldModel },
        { id: 'reasoning', component: agent.bridge },
        { id: 'planning', component: agent.planner },
        { id: 'action', component: agent.skills }
    ]
});

// Training loop with self-improvement
for (let generation = 0; generation < 100; generation++) {
    // Collect experience in parallel
    const experiences = await workerPool.submitBatch(
        Array(8).fill(null).map(() => ({
            type: 'rollout',
            env: 'CompositionalWorld',
            policy: agent,
            steps: 500
        }))
    );
    
    // Process experience
    for (const exp of experiences) {
        for (const transition of exp.result.trajectory) {
            // Learn from transition
            await agent.learn(
                transition.state,
                transition.action,
                transition.reward,
                transition.nextState,
                transition.done
            );
            
            // Update world model
            worldModel.processTransition(transition);
            
            // Discover skills
            skillDiscovery.processTransition(transition);
        }
    }
    
    // Train world model
    await worldModel.train(collectedTransitions, 100);
    
    // Evaluate performance
    const evaluation = metaController.evaluate();
    metaController.onPerformance({ score: evaluation.score });
    
    // Self-modify architecture if needed
    if (generation % 10 === 0) {
        const modification = metaController.proposeModification();
        if (modification) {
            metaController.applyModification(modification);
        }
    }
    
    // Benchmark periodically
    if (generation % 20 === 0) {
        const runner = new BenchmarkRunner({ numEpisodes: 50 });
        const results = await runner.run(agent, [{ name: 'CompositionalWorld' }]);
        console.log(`Generation ${generation}: ${results.overall.avgReward}`);
    }
}

// Cleanup
await workerPool.shutdown();
await skillDiscovery.shutdown();
await worldModel.shutdown();
await metaController.shutdown();
await agent.close();
```

## Performance Considerations

1. **Worker Pool Sizing**: Match `numWorkers` to CPU cores for CPU-bound tasks
2. **Experience Buffer**: Use prioritized replay for sample efficiency
3. **World Model Horizon**: Balance imagination depth with uncertainty
4. **Skill Discovery**: Tune `bottleneckThreshold` for meaningful abstractions
5. **Meta-Learning Rate**: Lower values for stable environments, higher for dynamic

## Extending the Framework

### Creating Custom Components

```javascript
import { Component } from '@senars/rl';

export class CustomModule extends Component {
    constructor(config = {}) {
        super({
            customParam: 'default',
            ...config
        });
    }
    
    async onInitialize() {
        // Setup resources
    }
    
    async process(input, context) {
        // Custom logic
        return result;
    }
    
    serialize() {
        return {
            ...super.serialize(),
            customState: this.customState
        };
    }
}
```

### Registering with Registry

```javascript
import { globalRegistry } from '@senars/rl';
import { CustomModule } from './CustomModule.js';

globalRegistry.register('customModule', CustomModule, {
    aliases: ['cm', 'custom'],
    dependencies: ['logger'],
    version: '1.0.0',
    description: 'Custom processing module'
});
```

## API Reference

### Component

| Method                 | Description                       |
|------------------------|-----------------------------------|
| `initialize()`         | Initialize component and children |
| `shutdown()`           | Cleanup resources                 |
| `add(name, component)` | Add child component               |
| `remove(name)`         | Remove child component            |
| `get(name)`            | Get child component               |
| `setState(key, value)` | Set internal state                |
| `getState(key)`        | Get internal state                |
| `subscribe(event, cb)` | Subscribe to events               |
| `emit(event, data)`    | Emit event                        |
| `serialize()`          | Serialize component               |

### MetaController

| Method                     | Description                     |
|----------------------------|---------------------------------|
| `setArchitecture(arch)`    | Set current architecture        |
| `getArchitecture()`        | Get current architecture        |
| `evaluate()`               | Evaluate performance            |
| `proposeModification()`    | Generate modification proposal  |
| `applyModification(mod)`   | Apply architecture modification |
| `getModificationHistory()` | Get modification log            |

### TensorLogicBridge

| Method                    | Description                |
|---------------------------|----------------------------|
| `liftToSymbols(tensor)`   | Convert tensor to symbols  |
| `groundToTensor(symbols)` | Convert symbols to tensor  |
| `symbolicAdd(t1, t2)`     | Add with symbol merging    |
| `symbolicMul(t1, t2)`     | Multiply with intersection |
| `extractRules(tensor)`    | Extract symbolic rules     |

## Troubleshooting

### Common Issues

**Worker timeout**: Increase `workerTimeout` or optimize task complexity

**Memory growth**: Reduce `capacity` in buffers, enable pruning

**Skill explosion**: Increase `minUsageCount` for skill discovery

**Meta-instability**: Lower `metaLearningRate` or increase `evaluationWindow`

### Debugging

```javascript
// Enable verbose logging
const metaController = new MetaController({ verbose: true });

// Subscribe to events
metaController.subscribe('modification', (data) => {
    console.log('Architecture modified:', data);
});

// Get detailed stats
const stats = workerPool.getStats();
const workerStatus = workerPool.getWorkerStatus();
```

## License

AGPL-3.0-or-later
