# Hybrid Action Spaces & Emergent Cognitive Architecture

## Vision

Enable **true simultaneous control of both continuous and discrete actions** within unified environments, with *
*emergent cognitive architectures** where solutions arise naturally from component interaction rather than hardcoded
pipelines.

## 🎯 Key Innovations

### 1. True Hybrid Action Spaces (Not Switching)

Unlike previous approaches that switch between discrete and continuous modes, this system enables **simultaneous control
** of both action types:

```
┌─────────────────────────────────────────────────────────────┐
│                    Hybrid Action                             │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ Discrete        │  │ Continuous                       │   │
│  │ • grip: 0/1     │  │ • velocity: [0.5, -0.3]         │   │
│  │ • tool: 0-3     │  │ • rotation: 0.8                  │   │
│  │ • button: 0/1   │  │ • force: 0.25                    │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
│                                                              │
│  Both action types selected SIMULTANEOUSLY each timestep    │
└─────────────────────────────────────────────────────────────┘
```

### 2. Emergent Cognition

Solutions **emerge** from the interaction of cognitive primitives rather than being hardcoded:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Perception  │───→│ Reasoning   │───→│   Action    │
│  Primitive  │    │  Primitive  │    │  Primitive  │
└─────────────┘    └─────────────┘    └─────────────┘
       ↓                  ↓                  ↓
┌─────────────────────────────────────────────────────────┐
│              Emergent Patterns Arise From                │
│           Co-activation & Information Flow               │
└─────────────────────────────────────────────────────────┘
```

## 📦 New Modules

### 1. Hybrid Action Space System

**File: `environments/HybridActionSpace.js` (~740 lines)**

| Component                  | Purpose                                       |
|----------------------------|-----------------------------------------------|
| `HybridActionSpace`        | Unified space combining discrete + continuous |
| `StructuredAction`         | Action object with both component types       |
| `HybridEnvironmentAdapter` | Environment wrapper for hybrid actions        |
| `HybridActionSelector`     | Selects both action types simultaneously      |
| `HybridActionSpaceFactory` | Factory for common hybrid configurations      |

#### HybridActionSpace API

```javascript
import { HybridActionSpace } from '@senars/rl';

// Robot arm: discrete grip + continuous joints
const robotArmSpace = new HybridActionSpace({
    discrete: {
        grip: { n: 2 },      // open/close
        tool: { n: 4 }       // 4 tool types
    },
    continuous: {
        joint1: { low: -Math.PI, high: Math.PI },
        joint2: { low: -Math.PI, high: Math.PI },
        joint3: { low: -Math.PI, high: Math.PI }
    }
});

// Sample hybrid action
const action = robotArmSpace.sample();
// { grip: 1, tool: 2, joint1: 0.5, joint2: -1.2, joint3: 2.1 }

// Validate action
robotArmSpace.contains({
    grip: 0,
    tool: 3,
    joint1: 0.5,
    joint2: -0.3,
    joint3: 1.8
}); // true

// Flatten for neural networks
const flat = robotArmSpace.flatten(action);
// [0, 1, 0, 0, 1, 0, 0.5, -1.2, 2.1]  (one-hot discrete + continuous)

// Reconstruct from flat
const reconstructed = robotArmSpace.unflatten(flat);
```

#### StructuredAction API

```javascript
import { StructuredAction } from '@senars/rl';

// Build action fluently
const action = new StructuredAction()
    .discrete('grip', 1)
    .discrete('tool', 0)
    .continuous('velocity', [0.5, -0.3])
    .continuous('rotation', 0.8)
    .setMetadata('source', 'policy');

// Access components
action.getDiscrete('grip');      // 1
action.getContinuous('velocity'); // [0.5, -0.3]
action.getAllDiscrete();          // { grip: 1, tool: 0 }
action.getAllContinuous();        // { velocity: [0.5, -0.3], rotation: 0.8 }

// Clone
const cloned = action.clone();

// Serialize
const json = action.toJSON();
const restored = StructuredAction.fromJSON(json);
```

#### Hybrid Action Selection

```javascript
import { HybridActionSelector, HybridActionSpace } from '@senars/rl';

const selector = new HybridActionSelector({
    discreteStrategy: 'argmax',      // or 'softmax'
    continuousStrategy: 'sample',     // or 'deterministic'
    temperature: 1.0
});

const actionSpace = new HybridActionSpace({
    discrete: { grip: { n: 2 } },
    continuous: { velocity: { low: -1, high: 1 } }
});

// Set action values from neural network output
const neuralOutput = [2.0, 0.5, 0.8, -0.3];  // grip logits + velocity
selector.setActionValues(neuralOutput, actionSpace);

// Select hybrid action (both types simultaneously)
const action = selector.select(actionSpace, {
    exploration: 0.1
});

// action is a StructuredAction with both discrete and continuous
```

#### Hybrid Environment Adapter

```javascript
import { HybridEnvironmentAdapter } from '@senars/rl';

// Wrap environment with hybrid action space
const adapter = new HybridEnvironmentAdapter(env, {
    discrete: { grip: { n: 2 } },
    continuous: { velocity: { shape: [2], low: -1, high: 1 } }
});

// Create structured action
const action = adapter.createAction(
    { grip: 1 },           // discrete
    { velocity: [0.5, -0.3] }  // continuous
);

// Step environment
const { observation, reward, terminated } = adapter.step(action);

// Sample hybrid action
const sampled = adapter.sample();

// Check validity
adapter.isValidAction(action);  // true
```

#### Pre-built Hybrid Spaces

```javascript
import { HybridActionSpaceFactory } from '@senars/rl';

// Robot arm with joints and grippers
const robotArm = HybridActionSpaceFactory.createRobotArm(
    3,  // joints
    2   // grippers
);

// Navigation + interaction
const navigation = HybridActionSpaceFactory.createNavigationInteraction();
// { interact: discrete, velocity: continuous, rotation: continuous }

// Custom hybrid space
const custom = HybridActionSpaceFactory.createCustom(
    { button: { n: 2 }, mode: { n: 4 } },
    { slider: { low: 0, high: 100 }, dial: { low: -1, high: 1 } }
);
```

### 2. Emergent Cognitive Architecture

**File: `cognitive/EmergentArchitecture.js` (~880 lines)**

| Component                       | Purpose                                |
|---------------------------------|----------------------------------------|
| `CognitivePrimitive`            | Base class for cognitive operations    |
| `PerceptionPrimitive`           | Feature extraction and symbol lifting  |
| `ReasoningPrimitive`            | Symbolic inference and belief revision |
| `ActionSelectionPrimitive`      | Hybrid action selection                |
| `MemoryPrimitive`               | Experience storage and retrieval       |
| `EmergentCognitiveArchitecture` | Self-organizing cognitive system       |
| `EmergentArchitectureFactory`   | Factory for cognitive architectures    |

#### Cognitive Primitives

```javascript
import { 
    PerceptionPrimitive,
    ReasoningPrimitive,
    ActionSelectionPrimitive,
    MemoryPrimitive
} from '@senars/rl';

// Perception: extracts features and symbols
const perception = new PerceptionPrimitive({
    name: 'perception',
    symbolThreshold: 0.5,
    featureExtractors: [
        obs => obs.map(x => x * 2)  // Custom extractor
    ]
});

// Reasoning: performs inference
const reasoning = new ReasoningPrimitive({
    name: 'reasoning',
    inferenceDepth: 3
});

// Action: selects hybrid actions
const action = new ActionSelectionPrimitive({
    name: 'action',
    actionSpace: hybridActionSpace,
    discreteStrategy: 'softmax',
    continuousStrategy: 'sample'
});

// Memory: stores experiences
const memory = new MemoryPrimitive({
    name: 'memory',
    capacity: 10000
});
```

#### Emergent Architecture

```javascript
import { EmergentCognitiveArchitecture } from '@senars/rl';

const arch = new EmergentCognitiveArchitecture({
    name: 'EmergentRobot',
    actionSpace: hybridActionSpace,
    emergenceThreshold: 0.3,  // Activation threshold for pattern detection
    connectionStrength: 0.5
});

// Connect primitives (optional - default connections exist)
arch.connect('perception', 'symbols', 'reasoning', 'symbols');
arch.connect('reasoning', 'conclusions', 'action', 'conclusions');

// Process observation - cognition emerges from primitive interaction
const result = await arch.process(observation, {
    goals: [{ preferredAction: 0 }],
    explorationRate: 0.1
});

// Result contains:
// - action: StructuredAction with discrete + continuous
// - activations: outputs from each primitive
// - emergentPatterns: detected co-activation patterns
// - globalState: shared state across primitives

// Learn from experience
await arch.learn(transition, reward);

// Get cognitive state
const state = arch.getState();
// { primitives, globalState, emergentPatterns }
```

#### Emergent Pattern Detection

The architecture automatically detects emergent patterns:

```javascript
const result = await arch.process(observation);

// Emergent patterns detected
for (const pattern of result.emergentPatterns) {
    console.log(`Pattern: ${pattern.type}`);
    console.log(`Strength: ${pattern.strength}`);
    
    // Types:
    // - 'co-activation': multiple primitives highly active
    // - 'reasoning-driven': strong conclusions leading to action
}
```

#### Factory Presets

```javascript
import { EmergentArchitectureFactory } from '@senars/rl';

// For hybrid action spaces
const hybridArch = EmergentArchitectureFactory.createForHybridAction(
    hybridActionSpace,
    { emergenceThreshold: 0.3 }
);

// Minimal architecture
const minimal = EmergentArchitectureFactory.createMinimal();

// Complex architecture with low emergence threshold
const complex = EmergentArchitectureFactory.createComplex({
    emergenceThreshold: 0.1,  // More sensitive to patterns
    connectionStrength: 0.9
});
```

## 🔗 Integration Examples

### Example 1: Robot Arm Control

```javascript
import { 
    HybridActionSpaceFactory, 
    HybridEnvironmentAdapter,
    EmergentArchitectureFactory
} from '@senars/rl';

// Create robot arm action space
const actionSpace = HybridActionSpaceFactory.createRobotArm(
    3,  // 3 joints
    2   // 2 grippers
);

// Create environment
const env = new HybridEnvironmentAdapter(robotEnv, {
    discrete: {
        grip_left: { n: 2 },
        grip_right: { n: 2 }
    },
    continuous: {
        joint_1: { low: -Math.PI, high: Math.PI },
        joint_2: { low: -Math.PI, high: Math.PI },
        joint_3: { low: -Math.PI, high: Math.PI }
    }
});

// Create emergent cognitive architecture
const agent = EmergentArchitectureFactory.createForHybridAction(actionSpace);
await agent.initialize();

// Control loop
for (let episode = 0; episode < 1000; episode++) {
    let { observation } = env.reset();
    
    for (let step = 0; step < 200; step++) {
        // Agent selects BOTH discrete (grip) AND continuous (joints) simultaneously
        const action = await agent.act(observation, {
            explorationRate: Math.max(0.01, 0.5 * (1 - episode / 1000))
        });
        
        // action is a StructuredAction:
        // - action.getDiscrete('grip_left') -> 0 or 1
        // - action.getContinuous('joint_1') -> [-π, π]
        
        const { observation: nextObs, reward, terminated } = env.step(action);
        
        await agent.learn({
            state: observation,
            action,
            reward,
            nextState: nextObs,
            done: terminated
        }, reward);
        
        observation = nextObs;
        if (terminated) break;
    }
}
```

### Example 2: Navigation + Interaction

```javascript
import { HybridActionSpace, EmergentCognitiveArchitecture } from '@senars/rl';

// Create hybrid action space for navigation + interaction
const actionSpace = new HybridActionSpace({
    discrete: {
        interact: { n: 3 }  // none, use, examine
    },
    continuous: {
        velocity: { shape: [2], low: -1, high: 1 },  // x, y movement
        rotation: { low: -1, high: 1 }
    }
});

// Create emergent architecture
const arch = new EmergentCognitiveArchitecture({
    name: 'NavigationAgent',
    actionSpace,
    emergenceThreshold: 0.2
});

// Process observation
const result = await arch.process(sensorData, {
    goals: [
        { type: 'navigate', target: [5, 3] },
        { type: 'interact', object: 'door' }
    ]
});

// Result action has BOTH navigation AND interaction
const action = result.action;
console.log(action.getDiscrete('interact'));    // 0, 1, or 2
console.log(action.getContinuous('velocity'));  // [vx, vy]
console.log(action.getContinuous('rotation'));  // rotation speed

// Emergent patterns show cognitive coordination
for (const pattern of result.emergentPatterns) {
    if (pattern.type === 'co-activation') {
        console.log(`Navigation and interaction primitives co-activated!`);
    }
}
```

### Example 3: Multi-Modal Manipulation

```javascript
import { StructuredAction, HybridActionSelector } from '@senars/rl';

// Create complex hybrid action
const action = new StructuredAction()
    .discrete('grip', 1)           // Close gripper
    .discrete('tool', 2)           // Select tool 2
    .discrete('mode', 0)           // Position mode
    .continuous('velocity', [0.5, -0.3, 0.1])  // 3D velocity
    .continuous('force', 0.8)      // Grip force
    .continuous('torque', [0.1, -0.2, 0.05]);  // 3D torque

// All components selected SIMULTANEOUSLY
console.log(action.flatten());
// [0, 1, 0, 0, 1, 0, 0.5, -0.3, 0.1, 0.8, 0.1, -0.2, 0.05]

// Set metadata for analysis
action.setMetadata('decision_time', Date.now());
action.setMetadata('confidence', 0.95);
```

## 📊 Architecture Comparison

| Feature          | Traditional        | Switching          | **Hybrid (Ours)**            |
|------------------|--------------------|--------------------|------------------------------|
| **Action Types** | One type           | Either/Or          | **Both Simultaneously**      |
| **Selection**    | Separate           | Mode-dependent     | **Unified**                  |
| **Learning**     | Separate policies  | Switching policies | **Single integrated policy** |
| **Environment**  | Fixed type         | Mode switching     | **Native hybrid**            |
| **Cognition**    | Hardcoded pipeline | Conditional        | **Emergent**                 |

## 🧪 Test Coverage

**40+ tests** in `tests/integration/hybrid_emergent.test.js`:

- ✅ HybridActionSpace (creation, sampling, validation, flatten/unflatten)
- ✅ StructuredAction (construction, access, metadata, serialization)
- ✅ HybridActionSelector (discrete + continuous selection)
- ✅ HybridActionSpaceFactory (presets)
- ✅ HybridEnvironmentAdapter (wrapping, inference)
- ✅ CognitivePrimitives (perception, reasoning, action, memory)
- ✅ EmergentCognitiveArchitecture (processing, learning, patterns)
- ✅ EmergentArchitectureFactory (presets)

**All tests passing** ✅

## 🔮 Emergent Intelligence

The architecture enables **emergent intelligence** through:

1. **Co-activation Patterns**: When perception and reasoning primitives activate together consistently, new cognitive
   pathways emerge

2. **Belief Revision**: Reasoning primitive continuously updates belief base, enabling adaptive behavior

3. **Experience-Guided Action**: Memory primitive retrieves relevant experiences, influencing action selection

4. **Hybrid Coordination**: Discrete and continuous actions are selected together, enabling complex coordinated
   behaviors

## 🏆 Achievement

This refactoring achieves:

1. **True Hybrid Control**: Simultaneous discrete + continuous action selection
2. **Emergent Cognition**: Solutions arise from component interaction
3. **Architectural Elegance**: Clean primitives that compose naturally
4. **Flexibility**: Works with any combination of action types
5. **Scalability**: Add new primitives without modifying existing code

The system is now positioned for **breakthrough general-purpose self-improving systems** with true hybrid action control
and emergent cognitive capabilities.
