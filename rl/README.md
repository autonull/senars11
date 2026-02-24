# SeNARS RL Module

**General-purpose Reinforcement Learning with Neuro-Symbolic Integration**

A modular, extensible RL framework leveraging:
- **SeNARS `core/`**: Uncertainty-aware reasoning, belief revision, goal management
- **MeTTa `metta/`**: Self-modifying symbolic programs, grounded operations
- **Tensor Logic `tensor/`**: Differentiable learning, automatic differentiation

---

## Quick Start

### Installation

```bash
npm install @senars/rl
```

### Basic Usage

```javascript
import { Agent, Environment, TensorLogicPolicy } from '@senars/rl';

// Create environment
const env = new Environment.createDiscrete(4, 4);

// Create policy
const policy = TensorLogicPolicy.createDiscrete(4, 4);
await policy.initialize();

// Training loop
for (let episode = 0; episode < 1000; episode++) {
    const { observation } = env.reset();
    let done = false;

    while (!done) {
        const { action } = await policy.selectAction(observation);
        const { observation: nextObs, reward, terminated, truncated } = env.step(action);
        
        await policy.update({ state: observation, action, reward, nextState: nextObs, done: terminated || truncated });
        
        done = terminated || truncated;
    }
}
```

### Neuro-Symbolic Agent

```javascript
import { NeuroSymbolicBridge, NeuroSymbolicAgent } from '@senars/rl';

// Create bridge
const bridge = NeuroSymbolicBridge.create({
    useSeNARS: true,
    maxReasoningCycles: 100
});

await bridge.initialize();

// Perceive-Reason-Act cycle
const { action, reasoning, symbolic } = await bridge.perceiveReasonAct(observation, {
    useNARS: true,
    useMeTTa: true,
    useTensor: true
});
```

---

## Core Components

### Agents

| Agent | Description |
|-------|-------------|
| `Agent` | Base class for all RL agents |
| `NeuralAgent` | Neural network-based agent |
| `DQNAgent` | Deep Q-Network agent |
| `PPOAgent` | Proximal Policy Optimization agent |
| `PolicyGradientAgent` | Policy gradient agent |
| `RandomAgent` | Random action baseline |

### Environments

| Environment | Description |
|-------------|-------------|
| `Environment` | Base class for RL environments |
| `DiscreteEnvironment` | Discrete action space environment |
| `ContinuousEnvironment` | Continuous action space environment |
| `EnhancedEnvironment` | Environment with wrappers |

### Policies

| Policy | Description |
|--------|-------------|
| `TensorLogicPolicy` | Tensor-based policy with symbolic integration |
| `PolicyNetwork` | Neural network policy |
| `AttentionPolicy` | Multi-head attention policy |
| `EnsemblePolicy` | Ensemble policy for uncertainty |

### Bridges

| Bridge | Description |
|--------|-------------|
| `NeuroSymbolicBridge` | Unified NARS ↔ MeTTa ↔ Tensor bridge |
| `SeNARSBridge` | SeNARS integration bridge |

### Neuro-Symbolic Systems

| System | Description |
|--------|-------------|
| `WorldModel` | Learned world model with imagination |
| `SymbolicDifferentiation` | Symbolic gradient computation |
| `NeuroSymbolicSystem` | Unified neuro-symbolic system |

---

## Architecture

```
rl/
├── src/
│   ├── core/           # Core RL abstractions (Agent, Environment, Architecture)
│   ├── bridges/        # Neuro-symbolic bridges
│   ├── policies/       # Policy implementations
│   ├── agents/         # Agent implementations
│   ├── environments/   # Environment implementations
│   ├── neurosymbolic/  # Neuro-symbolic primitives
│   ├── composable/     # Component system
│   ├── training/       # Training loops
│   ├── evaluation/     # Benchmarking
│   ├── memory/         # Memory systems
│   ├── meta/           # Meta-control
│   ├── modules/        # Planning, reasoning modules
│   ├── cognitive/      # Cognitive architectures
│   ├── skills/         # Skill systems
│   ├── plugins/        # Plugin system
│   ├── utils/          # Utilities
│   └── index.js        # Unified exports
```

---

## Advanced Usage

### Component Composition

```javascript
import { Component, CompositionEngine } from '@senars/rl';

class MyModule extends Component {
    async process(input) {
        return input * 2;
    }
}

const engine = new CompositionEngine();
engine.createPipeline('sense-act', [
    { id: 'perceive', component: sensor },
    { id: 'decide', component: policy },
    { id: 'act', component: actuator }
]);

const result = await engine.execute('sense-act', observation);
```

### Meta-Control

```javascript
import { MetaController } from '@senars/rl';

const metaController = new MetaController({
    metaLearningRate: 0.1,
    evolutionInterval: 100
});

await metaController.initialize();

// Propose architecture modification
const modification = await metaController.proposeModification(performance);
if (modification) {
    agent.applyModification(modification);
}
```

### Distributed Training

```javascript
import { WorkerPool, DistributedExperienceBuffer } from '@senars/rl';

const pool = new WorkerPool({ numWorkers: 8 });
await pool.initialize();

const results = await pool.submitBatch([
    { type: 'rollout', policy, steps: 500 },
    { type: 'rollout', policy, steps: 500 }
]);

const buffer = new DistributedExperienceBuffer({
    capacity: 100000,
    sampleStrategy: 'prioritized'
});
```

---

## API Reference

### Agent

```javascript
class Agent extends Component {
    act(observation, options)      // Select action
    learn(obs, act, rew, next, done) // Learn from transition
    save(path)                      // Save to disk
    load(path)                      // Load from disk
    getStats()                      // Get statistics
}
```

### Environment

```javascript
class Environment extends Component {
    reset(options)                  // Reset environment
    step(action)                    // Execute action
    render(mode)                    // Render
    sampleAction()                  // Sample random action
    get observationSpace()          // Observation space
    get actionSpace()               // Action space
}
```

### NeuroSymbolicBridge

```javascript
class NeuroSymbolicBridge extends Component {
    inputNarsese(narsese, options)  // Input Narsese statement
    askNarsese(question, options)   // Ask question
    achieveGoal(goal, options)      // Achieve goal
    executeMetta(program, options)  // Execute MeTTa program
    liftToSymbols(tensor, options)  // Tensor → Symbols
    groundToTensor(symbols, shape)  // Symbols → Tensor
    perceiveReasonAct(obs, options) // Full P-R-A cycle
}
```

---

## Testing

```bash
# Run unit tests
npm test

# Run specific test
node rl/tests/unit/core.test.js
```

---

## Documentation

- **[Neuro-Symbolic Architecture](NEUROSYMBOLIC_RL_ARCHITECTURE.md)** - Complete architecture
- **[Implementation Guide](IMPLEMENTATION_GUIDE.md)** - API reference
- **[Advanced Architecture](ADVANCED_ARCHITECTURE.md)** - Advanced patterns

### Interfaces

The RL module provides formal interfaces for type checking and documentation:

```javascript
import { IAgent, IEnvironment, IArchitecture, IPolicy } from '@senars/rl';

/**
 * @implements {IAgent}
 */
class MyAgent extends Component {
    async act(observation, options) { /* ... */ }
    async learn(obs, action, reward, nextObs, done) { /* ... */ }
    async save(path) { /* ... */ }
    async load(path) { /* ... */ }
    setTraining(training) { /* ... */ }
    getStats() { /* ... */ }
    reset() { /* ... */ }
}
```

| Interface | Description |
|-----------|-------------|
| `IAgent` | Contract for all RL agents (act, learn, save, load, etc.) |
| `IEnvironment` | Contract for environments (reset, step, spaces, etc.) |
| `IArchitecture` | Contract for architectures (act, learn, close) |
| `IPolicy` | Contract for policies (selectAction, update, etc.) |

---

## Dependencies

- `@senars/core`: SeNARS reasoning engine
- `@senars/metta`: MeTTa interpreter
- `@senars/tensor`: Tensor operations

---

## License

AGPL-3.0-or-later
