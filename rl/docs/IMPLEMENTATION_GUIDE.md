# Neuro-Symbolic RL Framework - Implementation Guide

## Overview

This document provides comprehensive implementation details for the **Neuro-Symbolic RL Framework** - a general-purpose, self-improving reinforcement learning system that synergizes **NARS**, **MeTTa**, and **Tensor Logic** for breakthrough cognitive capabilities.

## Architecture Summary

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEUROSYMBOLIC RL AGENT                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │   Bridge    │   │   Policy    │   │   Skills    │           │
│  │  (NARS +    │   │  (Tensor    │   │ (Hierarchical│           │
│  │   MeTTa)    │   │   Logic)    │   │  Discovery) │           │
│  └─────────────┘   └─────────────┘   └─────────────┘           │
│         │                 │                   │                  │
│         └─────────────────┴───────────────────┘                  │
│                           │                                      │
│                  ┌────────▼────────┐                             │
│                  │   Experience    │                             │
│                  │   (Causal +     │                             │
│                  │   Distributed)  │                             │
│                  └────────┬────────┘                             │
│                           │                                      │
│                  ┌────────▼────────┐                             │
│                  │   Meta-Controller                            │
│                  │   (Self-Modify) │                             │
│                  └─────────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Module Dependencies

```
@senars/rl
├── @senars/core      (NARS reasoning engine)
├── @senars/metta     (MeTTa interpreter)
└── @senars/tensor    (Tensor operations + autodiff)
```

---

## Component Implementation Details

### 1. NeuroSymbolicBridge

**File**: `rl/src/bridges/NeuroSymbolicBridge.js`

**Purpose**: Unified bidirectional translation between NARS (Narsese), MeTTa (symbols), and Tensor (vectors) representations.

**Key Classes**:
- `NeuroSymbolicBridge` - Main integration component
- `NeuroSymbolicBridgeFactory` - Factory for specialized configurations

**Core Operations**:

```javascript
// Tensor → Symbol → Narsese pipeline
const tensor = { data: [0.8, 0.2, 0.9, 0.1], shape: [4] };
const symbolic = bridge.liftToSymbols(tensor, { threshold: 0.5 });
const narsese = bridge.observationToNarsese(tensor.data);

// Narsese reasoning
await bridge.inputNarsese('<feature --> observed>.');
const answer = await bridge.askNarsese('<(?x) --> observed>?');

// Causal learning
await bridge.learnCausal({ state, action, nextState, reward });
const prediction = bridge.predictCausal(currentState, action);
```

**Implementation Notes**:
- Uses fallback modes when SeNARS/MeTTa not available
- Caches inference results for performance
- Tracks comprehensive metrics
- Supports gradient tracking for tensor operations

---

### 2. TensorLogicPolicy

**File**: `rl/src/policies/TensorLogicPolicy.js`

**Purpose**: Policy networks expressed as tensor operations with automatic differentiation and MeTTa integration.

**Key Classes**:
- `TensorLogicPolicy` - Neural policy with autodiff
- `TensorLogicPolicyFactory` - Factory for policy configurations

**Architecture**:
```
Input (state) → [Linear + ReLU]×N → Output (action logits)
                    ↓
              Autograd tracking
                    ↓
              Policy gradient loss
```

**Core Operations**:

```javascript
// Create policy
const policy = TensorLogicPolicyFactory.createDiscrete(
    64,  // input dim
    4,   // output dim
    { hiddenDim: 128, numLayers: 2 }
);
await policy.initialize();

// Forward pass
const output = policy.forward(state);

// Action selection
const { action, actionProb } = await policy.selectAction(state, {
    exploration: 0.1
});

// Training
const { loss } = await policy.update(experience, {
    advantages: [advantage]
});

// Rule extraction
const rules = policy.extractRules({ threshold: 0.5 });
```

**Learning Algorithms Supported**:
- REINFORCE (policy gradient)
- PPO-style clipped loss
- Advantage actor-critic

---

### 3. HierarchicalSkillSystem

**File**: `rl/src/skills/HierarchicalSkillDiscovery.js`

**Purpose**: Automatic discovery and composition of skills at multiple abstraction levels with neuro-symbolic grounding.

**Key Classes**:
- `Skill` - Skill representation with pre/post conditions
- `HierarchicalSkillSystem` - Skill discovery and management
- `SkillSystemFactory` - Factory for skill systems

**Skill Structure**:
```javascript
class Skill {
    id: string
    name: string
    precondition: Narsese    // When applicable
    postcondition: Narsese   // What it achieves
    policy: TensorLogicPolicy // How to execute
    level: number            // Abstraction level
    successCount, failureCount, totalReward
}
```

**Core Operations**:

```javascript
// Initialize skill system
const skillSystem = SkillSystemFactory.createManipulation({
    minSupport: 3,
    maxLevels: 4
});
await skillSystem.initialize();

// Discover skills from experience
const newSkills = await skillSystem.discoverSkills(experiences);

// Compose skills for goal
const composedSkill = await skillSystem.composeSkills('reach_goal');

// Get applicable skills
const applicable = skillSystem.getApplicableSkills(currentState);

// Export to MeTTa
const mettaSkills = skillSystem.exportToMetta();
```

**Discovery Algorithm**:
1. Cluster state-action pairs by similarity
2. Induce preconditions from state clusters
3. Induce postconditions from next-state clusters
4. Train policy from action-reward pairs
5. Determine hierarchy level from condition complexity
6. Check novelty against existing skills

---

### 4. DistributedExperienceBuffer

**File**: `rl/src/experience/DistributedExperienceBuffer.js`

**Purpose**: Scalable experience storage with causal indexing, prioritized sampling, and distributed aggregation.

**Key Classes**:
- `CausalExperience` - Experience with causal annotations
- `DistributedExperienceBuffer` - Main buffer implementation
- `ExperienceBufferFactory` - Factory for buffers
- `SumTree` - Priority-based sampling data structure

**Features**:
- **Causal Indexing**: Experiences indexed by causal signatures
- **Prioritized Sampling**: Sample by TD-error or causal relevance
- **Distributed Aggregation**: Collect from multiple workers
- **Causal Graph**: Track discovered causal relationships

**Core Operations**:

```javascript
// Create buffer
const buffer = ExperienceBufferFactory.createCausal(100000, {
    batchSize: 32,
    useCausalIndexing: true
});
await buffer.initialize();

// Store experiences
await buffer.store(experience);
await buffer.storeBatch(experiences);

// Sample with different strategies
const random = await buffer.sample(32, { strategy: 'random' });
const prioritized = await buffer.sample(32, { strategy: 'prioritized' });
const causal = await buffer.sample(32, { 
    strategy: 'causal',
    causalQuery: currentState
});

// Distributed operations
buffer.registerWorker(workerId);
await buffer.receiveFromWorker(workerId, experiences);
await buffer.aggregateWorkers();
```

**Sampling Strategies**:
- `random` - Uniform random sampling
- `prioritized` - By TD-error priority
- `causal` - By causal similarity to query
- `recent` - Most recent experiences

---

### 5. MetaController

**File**: `rl/src/meta/MetaController.js`

**Purpose**: Self-modifying architecture controller that proposes and evaluates architectural modifications during learning.

**Key Classes**:
- `ModificationOperator` - Architecture modification operation
- `MetaController` - Main meta-control component
- `MetaControllerFactory` - Factory for meta-controllers

**Modification Types**:
- `add` - Add new component
- `remove` - Remove existing component
- `replace` - Replace component
- `modify` - Modify component parameters
- `connect` - Connect components
- `disconnect` - Disconnect components

**Core Operations**:

```javascript
// Create meta-controller
const metaController = MetaControllerFactory.createArchitectureSearch({
    populationSize: 10,
    mutationRate: 0.3,
    useImagination: true
});
await metaController.initialize();

// Set initial architecture
metaController.setArchitecture(initialArchitecture);

// Evaluate performance and potentially modify
const result = await metaController.evaluatePerformance(reward);
if (result.modified) {
    console.log('Architecture modified!');
}

// Propose modification
const modification = await metaController.proposeModification();

// Apply modification
await metaController.applyModification(modification);

// Evolve architecture (population-based search)
const bestArchitecture = await metaController.evolveArchitecture(
    generations: 10,
    fitnessFn: evaluateArchitecture
);
```

**Modification Proposal Process**:
1. Generate candidate modifications from operator pool
2. Generate additional candidates using NARS reasoning
3. Generate additional candidates using MeTTa programs
4. Evaluate candidates in imagination (world model simulation)
5. Select best candidate with exploration

---

### 6. Neuro-Symbolic Benchmarking

**File**: `rl/src/evaluation/NeuroSymbolicBenchmarking.js`

**Purpose**: Comprehensive evaluation framework with neuro-symbolic specific metrics.

**Key Classes**:
- `NeuroSymbolicMetricsCollector` - Extended metrics collection
- `NeuroSymbolicBenchmarkRunner` - Extended benchmark runner
- `AgentComparator` - Statistical comparison of agents
- `BenchmarkFactory` - Factory for benchmark configurations

**Evaluation Dimensions**:

| Dimension | Metrics |
|-----------|---------|
| **RL Performance** | Reward, success rate, sample efficiency |
| **Reasoning** | Inference accuracy, planning success, belief revision |
| **Grounding** | Tensor-symbol conversion accuracy, consistency |
| **Transfer** | Few-shot learning, zero-shot transfer |
| **Interpretability** | Rule count, rule coverage, explanation quality |

**Core Operations**:

```javascript
// Create benchmark runner
const runner = BenchmarkFactory.createComprehensive({
    numEpisodes: 100,
    evaluateReasoning: true,
    evaluateGrounding: true,
    evaluateTransfer: true
});
await runner.initialize();

// Run benchmark
const results = await runner.run(agent, [
    { name: 'CartPole', env: cartpoleEnv }
]);

// Access results
console.log('Overall reward:', results.overall.avgReward);
console.log('Inference accuracy:', results.neuroSymbolic.reasoning.inferenceAccuracy.mean);
console.log('Grounding consistency:', results.neuroSymbolic.grounding.groundingConsistency.mean);

// Compare agents
const comparator = new AgentComparator({ testType: 't-test' });
const comparison = await comparator.compare(agent1, agent2, environments);
```

---

## Usage Examples

### Example 1: Basic Neuro-Symbolic Agent

```javascript
import { NeuroSymbolicAgent, CartPole } from '@senars/rl';

const env = new CartPole({ maxSteps: 200 });
const agent = new NeuroSymbolicAgent(env, {
    architecture: 'dual-process',
    reasoning: 'metta',
    planning: true,
    skillDiscovery: true
});

await agent.initialize();

for (let episode = 0; episode < 1000; episode++) {
    const { observation } = env.reset();
    let totalReward = 0;

    for (let step = 0; step < 200; step++) {
        const action = await agent.act(observation, {
            useReasoning: true,
            usePolicy: true,
            explorationRate: Math.max(0.01, 0.5 * (1 - episode / 1000))
        });

        const { observation: nextObs, reward, terminated } = env.step(action);
        await agent.learn(observation, action, reward, nextObs, terminated);

        totalReward += reward;
        observation = nextObs;
        if (terminated) break;
    }

    if (episode % 10 === 0) {
        console.log(`Episode ${episode}: ${totalReward}`);
    }
}

await agent.close();
```

### Example 2: Custom Architecture with Meta-Controller

```javascript
import {
    MetaController,
    NeuroSymbolicBridge,
    TensorLogicPolicy
} from '@senars/rl';

const metaController = new MetaController({
    useImagination: true,
    populationSize: 20
});
await metaController.initialize();

const bridge = new NeuroSymbolicBridge();
await bridge.initialize();

// Set initial architecture
metaController.setArchitecture({
    stages: [
        { id: 'perception', component: bridge },
        { id: 'reasoning', component: bridge },
        { id: 'action', component: bridge }
    ]
});

// Training with architecture evolution
for (let gen = 0; gen < 100; gen++) {
    const performance = await trainAndGetReward();
    
    const result = await metaController.evaluatePerformance(performance);
    
    if (result.modified) {
        console.log(`Generation ${gen}: Architecture modified`);
    }
}

const bestArchitecture = await metaController.evolveArchitecture(10, {
    fitnessFn: evaluateArchitecture
});
```

### Example 3: Skill Discovery and Composition

```javascript
import {
    HierarchicalSkillSystem,
    DistributedExperienceBuffer
} from '@senars/rl';

const skillSystem = new HierarchicalSkillSystem({
    minSupport: 5,
    maxLevels: 4,
    useNarseseGrounding: true
});
await skillSystem.initialize();

const experienceBuffer = new DistributedExperienceBuffer({
    capacity: 10000,
    useCausalIndexing: true
});
await experienceBuffer.initialize();

// Collect experience
for (let episode = 0; episode < 100; episode++) {
    const trajectories = await collectTrajectories();
    await experienceBuffer.storeBatch(trajectories);
}

// Discover skills
const experiences = await experienceBuffer.sample(1000);
const newSkills = await skillSystem.discoverSkills(experiences, {
    consolidate: true
});

console.log(`Discovered ${newSkills.length} new skills`);

// Compose skills for complex goal
const composedSkill = await skillSystem.composeSkills('achieve_complex_goal');
```

---

## Performance Considerations

### Optimization Strategies

1. **Caching**: Inference results cached with TTL
2. **Batching**: Tensor operations batched when possible
3. **Lazy Evaluation**: Grounded ops only computed when needed
4. **Parallel Sampling**: Multiple workers for experience collection
5. **Priority Sampling**: Focus on high-learning-potential experiences

### Resource Management

```javascript
// Configure resource limits
const bridge = new NeuroSymbolicBridge({
    maxReasoningCycles: 50,      // Limit NARS cycles
    cacheInference: true,         // Enable caching
    inferenceCacheSize: 1000,    // Cache size limit
    gradientTracking: false      // Disable when not training
});
```

---

## Testing

### Running Tests

```bash
# Unit tests
node rl/tests/unit/neurosymbolic_rl.test.js

# Integration tests
node rl/tests/integration/senars_metta_tensor.test.js

# All tests
npm test
```

### Test Coverage

The test suite covers:
- Bridge operations (tensor-symbol-narsese conversion)
- Policy network forward/backward passes
- Skill discovery and composition
- Experience buffer storage and sampling
- Meta-controller modification proposals

---

## API Reference

### NeuroSymbolicBridge

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize bridge and sub-components |
| `inputNarsese(statement)` | Input Narsese statement |
| `askNarsese(question)` | Ask Narsese question |
| `achieveGoal(goal)` | Achieve goal using NARS planning |
| `liftToSymbols(tensor)` | Convert tensor to symbols |
| `groundToTensor(symbols)` | Convert symbols to tensor |
| `observationToNarsese(obs)` | Convert observation to Narsese |
| `learnCausal(transition)` | Learn causal relationship |
| `predictCausal(state, action)` | Predict causal outcome |
| `perceiveReasonAct(obs)` | Complete perception-action cycle |

### TensorLogicPolicy

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize policy and optimizer |
| `forward(state)` | Forward pass through network |
| `selectAction(state)` | Select action from policy |
| `update(experience)` | Update policy from experience |
| `extractRules()` | Extract symbolic rules |
| `getParameters()` | Get policy parameters |
| `setParameters(params)` | Set policy parameters |

### HierarchicalSkillSystem

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize skill system |
| `discoverSkills(experiences)` | Discover new skills |
| `composeSkills(goal)` | Compose skills for goal |
| `getApplicableSkills(state)` | Get applicable skills |
| `getSkill(id)` | Get skill by ID |
| `exportToMetta()` | Export to MeTTa format |
| `importFromMetta(metta)` | Import from MeTTa format |

### DistributedExperienceBuffer

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize buffer |
| `store(experience)` | Store single experience |
| `storeBatch(experiences)` | Store multiple experiences |
| `sample(k, options)` | Sample experiences |
| `registerWorker(id)` | Register worker |
| `receiveFromWorker(id, exp)` | Receive from worker |
| `aggregateWorkers()` | Aggregate all workers |
| `getStats()` | Get buffer statistics |

### MetaController

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize meta-controller |
| `setArchitecture(arch)` | Set current architecture |
| `evaluatePerformance(perf)` | Evaluate and potentially modify |
| `proposeModification()` | Propose modification |
| `applyModification(mod)` | Apply modification |
| `evolveArchitecture(gens)` | Evolve architecture |
| `getState()` | Get controller state |

---

## Troubleshooting

### Common Issues

**Issue**: SeNARS not available
- **Solution**: Bridge automatically falls back to symbolic mode

**Issue**: Tensor backend not available
- **Solution**: Policy uses random actions until backend loaded

**Issue**: Memory exhaustion with large experience buffer
- **Solution**: Reduce capacity or enable experience pruning

**Issue**: Slow inference
- **Solution**: Reduce `maxReasoningCycles`, enable caching

---

## Future Extensions

Planned enhancements:
1. **Multi-Agent Coordination**: Shared belief bases
2. **Hierarchical Action Spaces**: Discrete high-level, continuous low-level
3. **Meta-Learning Policies**: MeTTa scripts that generate policies
4. **Causal Transfer Learning**: Transfer graphs across domains
5. **Neuro-Symbolic Curriculum**: Progressive complexity

---

## References

- [Neuro-Symbolic Architecture Design](NEUROSYMBOLIC_RL_ARCHITECTURE.md)
- [SeNARS-MeTTa-Tensor Integration](SENARS_METTA_TENSOR_INTEGRATION.md)
- [Hybrid Emergent Architecture](HYBRID_EMERGENT_ARCHITECTURE.md)
- [Advanced Architecture Guide](ADVANCED_ARCHITECTURE.md)
