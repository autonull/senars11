
# Neuro-Symbolic RL Framework

A **general-purpose, self-improving neuro-symbolic reinforcement learning framework** that leverages **SeNARS**, **MeTTa**, and **Tensor Logic** for building versatile, self-modifying cognitive architectures.

## 🚀 Key Features

- **Neuro-Symbolic Integration**: Deep bidirectional bridge between NARS, MeTTa, and Tensor representations
- **Tensor Logic Policies**: Policy networks with automatic differentiation and symbolic rule extraction
- **Hierarchical Skill Discovery**: Automatic discovery and composition of skills with Narsese grounding
- **Distributed Experience**: Causal-indexed experience replay with prioritized sampling
- **Self-Modifying Architectures**: Meta-controller for automatic architecture evolution
- **Comprehensive Benchmarking**: Neuro-symbolic metrics with statistical comparison
- **Fine-Grained Composition**: Modular components that can be freely combined

## 🏗️ Architecture

### Core Components

| Module | Purpose |
|--------|---------|
| **NeuroSymbolicBridge** | Unified NARS ↔ MeTTa ↔ Tensor bidirectional translation |
| **TensorLogicPolicy** | Differentiable policy networks with rule extraction |
| **HierarchicalSkillSystem** | Skill discovery with neuro-symbolic grounding |
| **DistributedExperienceBuffer** | Causal-indexed experience replay |
| **MetaController** | Self-modifying architecture controller |
| **NeuroSymbolicBenchmarking** | Comprehensive evaluation suite |

### Directory Structure

```
rl/
├── src/
│   ├── bridges/                # Neuro-symbolic bridges
│   │   ├── SeNARSBridge.js
│   │   └── NeuroSymbolicBridge.js
│   ├── policies/               # Policy networks
│   │   └── TensorLogicPolicy.js
│   ├── skills/                 # Skill systems
│   │   ├── Skill.js
│   │   ├── SkillManager.js
│   │   ├── HierarchicalSkillSystem.js
│   │   └── HierarchicalSkillDiscovery.js
│   ├── experience/             # Experience systems
│   │   ├── ExperienceSystem.js
│   │   └── DistributedExperienceBuffer.js
│   ├── meta/                   # Meta-control
│   │   └── MetaController.js
│   ├── evaluation/             # Benchmarking
│   │   ├── Benchmarking.js
│   │   ├── NeuroSymbolicBenchmarking.js
│   │   └── StatisticalTests.js
│   ├── core/                   # Core abstractions
│   ├── agents/                 # Agent implementations
│   ├── environments/           # RL environments
│   ├── composable/             # Component system
│   ├── neurosymbolic/          # Tensor-logic primitives
│   └── reasoning/              # Causal reasoning
├── examples/
│   ├── neurosymbolic_rl_demo.js    # Comprehensive demo
│   ├── self_improving_agent.js     # Self-improvement demo
│   └── neurosymbolic_integration.js # Integration demo
├── tests/
│   ├── unit/
│   │   └── neurosymbolic_rl.test.js
│   └── integration/
└── docs/
    ├── NEUROSYMBOLIC_RL_ARCHITECTURE.md
    ├── IMPLEMENTATION_GUIDE.md
    └── ADVANCED_ARCHITECTURE.md
```

## Quick Start

### Installation

```bash
npm install @senars/rl
```

### Basic Usage

```javascript
import { NeuroSymbolicAgent, CartPole } from '@senars/rl';

const env = new CartPole();
const agent = new NeuroSymbolicAgent(env, {
    architecture: 'dual-process',
    reasoning: 'metta',
    planning: true
});

await agent.initialize();
const obs = env.reset().observation;
const action = await agent.act(obs);
```

### Run Comprehensive Demo

```bash
node rl/examples/neurosymbolic_rl_demo.js
```

### Self-Improving Agent

```javascript
import { 
    NeuroSymbolicAgent, 
    MetaController, 
    WorldModel,
    SkillDiscoveryEngine 
} from '@senars/rl';

// Create components
const agent = new NeuroSymbolicAgent(env);
const metaController = new MetaController({ metaLearningRate: 0.1 });
const worldModel = new WorldModel({ horizon: 10 });
const skillDiscovery = new SkillDiscoveryEngine();

// Initialize and set architecture
await metaController.initialize();
metaController.setArchitecture({
    stages: [
        { id: 'perception', component: agent.grounding },
        { id: 'world_model', component: worldModel },
        { id: 'reasoning', component: agent.bridge },
        { id: 'action', component: agent.skills }
    ]
});

// Training with self-improvement
for (let gen = 0; gen < 100; gen++) {
    // Collect experience, learn, discover skills
    // Meta-controller will propose architecture modifications
}
```

### Neuro-Symbolic Integration

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

// Convert to/from symbols
const symbols = bridge.liftToSymbols(tensor);
const grounded = bridge.groundToTensor(symbols, [4]);

// Symbolic operations
const result = bridge.symbolicAdd(tensor1, tensor2, 'union');

// Extract rules
const rules = bridge.extractRules(tensor, 0.7);
```

### Distributed Training

```javascript
import { WorkerPool, DistributedExperienceBuffer } from '@senars/rl';

// Create worker pool
const pool = new WorkerPool({ numWorkers: 8 });
await pool.initialize();

// Submit parallel rollouts
const results = await pool.submitBatch([
    { type: 'rollout', env: 'CartPole', policy, steps: 500 },
    { type: 'rollout', env: 'CartPole', policy, steps: 500 },
    // ...
]);

// Distributed experience buffer
const buffer = new DistributedExperienceBuffer({
    capacity: 100000,
    numBuffers: 4,
    sampleStrategy: 'prioritized'
});
```

## Advanced Features

### Component System

```javascript
import { Component, ComponentRegistry } from '@senars/rl';

class MyModule extends Component {
    async process(input) {
        return input * 2;
    }
}

// Register and create
const registry = new ComponentRegistry();
registry.register('myModule', MyModule);
const module = registry.create('myModule', { config });
```

### Pipeline Composition

```javascript
import { CompositionEngine, PipelineBuilder } from '@senars/rl';

const engine = new CompositionEngine();

// Create pipeline
engine.createPipeline('sense-act', [
    { id: 'perceive', component: sensor },
    { id: 'decide', component: policy },
    { id: 'act', component: actuator }
]);

// Execute
const result = await engine.execute('sense-act', observation);
```

### Benchmarking

```javascript
import { BenchmarkRunner, MetricsCollector } from '@senars/rl';

const runner = new BenchmarkRunner({ numEpisodes: 100 });
const results = await runner.run(agent, [
    { name: 'CartPole' },
    { name: 'GridWorld' }
]);

console.log(results.overall.avgReward);
```

## Examples

Run the self-improving agent demo:

```bash
node rl/examples/self_improving_agent.js
```

Run the neuro-symbolic integration demo:

```bash
node rl/examples/neurosymbolic_integration.js
```

## Testing

```bash
# Run unit tests
node rl/tests/unit/composable.test.js
node rl/tests/unit/neurosymbolic.test.js

# Run all tests
npm test
```

## Documentation

- **[Neuro-Symbolic Architecture](NEUROSYMBOLIC_RL_ARCHITECTURE.md)** - Complete architecture design
- **[Implementation Guide](IMPLEMENTATION_GUIDE.md)** - API reference and usage details
- **[Advanced Architecture](ADVANCED_ARCHITECTURE.md)** - Advanced patterns and examples
- **[SeNARS-MeTTa Integration](SENARS_METTA_TENSOR_INTEGRATION.md)** - Integration details
- **[Hybrid Emergent Architecture](HYBRID_EMERGENT_ARCHITECTURE.md)** - Hybrid action spaces

## Dependencies

- `@senars/core`: SeNARS reasoning engine
- `@senars/metta`: MeTTa interpreter with tensor primitives
- `@senars/tensor`: Tensor operations and autodiff

## Architecture Philosophy

This framework is designed for **bootstrap general-purpose self-improving systems**:

1. **Composability**: All components are fine-grained and freely composable
2. **Self-Modification**: Architectures can evolve through meta-learning
3. **Neuro-Symbolic**: Seamless integration of neural and symbolic processing
4. **Scalability**: Distributed execution for large-scale training
5. **Explainability**: Symbolic grounding provides interpretable decisions

## License

AGPL-3.0-or-later
