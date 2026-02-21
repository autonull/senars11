
# Neuro-Symbolic RL Framework

A **general-purpose, self-improving neuro-symbolic reinforcement learning framework** that leverages **SeNARS**, **MeTTa**, and **Tensor Logic** for building versatile, self-modifying cognitive architectures.

## 🚀 Key Features

- **Fine-Grained Composition**: Modular components that can be freely combined
- **Self-Modifying Architectures**: Meta-learning systems that evolve their own structure
- **Neuro-Symbolic Integration**: Bidirectional tensor-logic bridge for explainable AI
- **Hierarchical Skill Discovery**: Automatic discovery and composition of skills
- **World Model Learning**: Imagination-based planning with uncertainty estimation
- **Distributed Execution**: Parallel training across workers and machines
- **Comprehensive Benchmarking**: Systematic evaluation with statistical testing

## Architecture

### Core Components

| Module | Description |
|--------|-------------|
| **Composable System** | Fine-grained components with lifecycle, events, and composition |
| **MetaController** | Self-modifying architecture with meta-learning |
| **Tensor-Logic Bridge** | Bidirectional neural-symbolic conversion |
| **World Model** | Dynamics learning and imagination |
| **Skill System** | Hierarchical discovery and composition |
| **Distributed** | Worker pools, experience buffers, parameter servers |
| **Evaluation** | Benchmarking, metrics, statistical comparison |

### Directory Structure

```
rl/
├── src/
│   ├── composable/           # NEW: Composable module system
│   │   ├── Component.js
│   │   ├── ComponentRegistry.js
│   │   ├── CompositionEngine.js
│   │   └── MetaController.js
│   ├── neurosymbolic/        # NEW: Neuro-symbolic primitives
│   │   ├── TensorLogicBridge.js
│   │   └── WorldModel.js
│   ├── distributed/          # NEW: Parallel execution
│   │   ├── ParallelExecution.js
│   │   └── Worker.js
│   ├── evaluation/           # NEW: Benchmarking
│   │   └── Benchmarking.js
│   ├── skills/               # Enhanced: Hierarchical skills
│   │   ├── Skill.js
│   │   ├── SkillManager.js
│   │   └── HierarchicalSkillSystem.js
│   ├── core/                 # Core abstractions
│   ├── agents/               # Agent implementations
│   ├── architectures/        # Architecture patterns
│   ├── environments/         # RL environments
│   ├── modules/              # Planning, motivation, etc.
│   └── bridges/              # SeNARS integration
├── examples/
│   ├── self_improving_agent.js    # Complete self-improvement demo
│   └── neurosymbolic_integration.js  # Tensor-logic bridge demo
└── tests/
    └── unit/
        ├── composable.test.js
        └── neurosymbolic.test.js
```

## Quick Start

### Basic Usage

```javascript
import { NeuroSymbolicAgent, CompositionalWorld } from '@senars/rl';

const env = new CompositionalWorld();
const agent = new NeuroSymbolicAgent(env, {
    planning: true,
    reasoning: 'metta',
    architecture: 'dual-process'
});

await agent.initialize();
const obs = env.reset().observation;
const action = await agent.act(obs);
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

- [Advanced Architecture Guide](ADVANCED_ARCHITECTURE.md) - Comprehensive API and examples
- [Implementation Guide](../../IMPLEMENTATION_GUIDE.md) - System architecture details
- [Enhancement Guide](../../ENHANCEMENT_GUIDE.md) - Best practices

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
