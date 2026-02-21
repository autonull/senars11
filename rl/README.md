
# Neuro-Symbolic RL Framework

This module implements a general-purpose neuro-symbolic reinforcement learning agent framework that leverages **SeNARS**, **MeTTa**, and **Tensor Logic**.

## Architecture

The framework is organized into the following components:

- **`src/core/`**: Core abstractions and data structures.
    - `RLAgent.js`: Base agent class.
    - `RLEnvironment.js`: Base environment class (Gym-compatible).
    - `SymbolGrounding.js`: Maps between neural observations/actions and symbolic representations.
    - `WorkingMemory.js`: Episodic buffer with symbolic indexing.
    - `SkillLibrary.js`: Repository for composable skills.

- **`src/agents/`**: Agent implementations.
    - `NeuroSymbolicAgent.js`: The main agent integrating SeNARS reasoning, planning, and learning.
    - `ProgrammaticAgent.js`: Extends MeTTa agent with Tensor primitives (formerly NeuroSymbolicAgent).
    - `MeTTaAgent.js`: Agent driven by MeTTa scripts.
    - `PolicyGradientAgent.js`: Neural-only baseline.
    - `RandomAgent.js`: Random baseline.

- **`src/environments/`**: Environments.
    - `CompositionalWorld.js`: Testbed for compositional generalization.
    - `GridWorld.js`, `Continuous1D.js`: Standard tasks.

- **`src/reasoning/`**: Symbolic reasoning components.
    - `SeNARSBridge.js`: Interface to the SeNARS reasoning engine.
    - `SymbolicPlanner.js`: High-level planner querying SeNARS.
    - `RuleInducer.js`: Learns temporal rules from experience.

- **`src/strategies/`**: High-level strategies.
    - `model-based.js`: Strategies using world models.
    - `hierarchical.js`: Strategies using skills/options.

## Usage

```javascript
import { NeuroSymbolicAgent, CompositionalWorld } from '@senars/rl';

const env = new CompositionalWorld();
const agent = new NeuroSymbolicAgent(env, {
    planning: true,
    reasoning: 'metta'
});

await agent.initialize();

const obs = env.reset().observation;
const action = await agent.act(obs);
const result = env.step(action);

await agent.learn(obs, action, result.reward, result.observation, result.terminated);
```

## Dependencies

- `@senars/core`: Reasoning engine.
- `@senars/metta`: MeTTa interpreter.
- `@senars/tensor`: Tensor operations (optional for some agents).
