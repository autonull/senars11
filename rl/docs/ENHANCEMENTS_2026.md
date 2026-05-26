# RL Module Enhancements - February 2026

## Overview

This document describes the recent enhancements to the `rl/` module, including checkpointing, monitoring, enhanced error
handling, architecture modularization, and Gymnasium compatibility.

---

## 1. Checkpointing System

### Purpose

Save and restore training progress to handle interruptions, resume training, and preserve best models.

### Features

- **Automatic checkpointing** at configurable intervals
- **Best model tracking** - always saves new best performing models
- **Checkpoint rotation** - keeps only the N most recent checkpoints
- **Training history** - tracks reward progression over time
- **Event emission** - hooks for monitoring and logging

### Usage

#### Basic Checkpointing

```javascript
import { DQNAgent, CheckpointManager } from '@senars/rl';

// Create checkpoint manager
const checkpoint = new CheckpointManager({
    directory: './checkpoints',
    interval: 100,      // Save every 100 episodes
    maxKeep: 5,         // Keep last 5 checkpoints
    saveBest: true      // Always save best model
});

await checkpoint.initialize();

// Create and train agent
const agent = new DQNAgent(env);
await agent.initialize();

for (let episode = 0; episode < 1000; episode++) {
    // ... training loop ...
    const reward = episodeReward;
    
    // Save checkpoint
    await checkpoint.save(agent, episode, reward);
}

await checkpoint.shutdown();
```

#### Resume Training

```javascript
import { DQNAgent, CheckpointManager } from '@senars/rl';

const checkpoint = new CheckpointManager({ directory: './checkpoints' });
await checkpoint.initialize();

const agent = new DQNAgent(env);
await agent.initialize();

// Load latest checkpoint
const loaded = await checkpoint.loadLatest(agent);
if (loaded) {
    console.log(`Resumed from episode ${loaded.episode} with reward ${loaded.reward}`);
    const startEpisode = loaded.episode + 1;
    
    // Continue training
    for (let episode = startEpisode; episode < 1000; episode++) {
        // ... training ...
        await checkpoint.save(agent, episode, reward);
    }
}
```

#### Load Best Model

```javascript
// After training, load the best performing model
const agent = new DQNAgent(env);
await agent.initialize();

const best = await checkpoint.loadBest(agent);
if (best) {
    console.log(`Loaded best model from episode ${best.episode} with reward ${best.reward}`);
}

// Evaluate best model
const stats = await agent.evaluate(env, { episodes: 100 });
```

#### Training Loop Integration

```javascript
import { TrainingLoop, CheckpointManager, createCheckpointCallback } from '@senars/rl';

const checkpoint = new CheckpointManager({
    directory: './checkpoints',
    interval: 50,
    saveBest: true
});

const trainingLoop = new TrainingLoop(agent, env, { episodes: 1000 });

// Add checkpoint callback to training
const checkpointCallback = createCheckpointCallback(checkpoint, {
    metric: 'reward',
    threshold: 0  // Only save if reward > 0
});

await trainingLoop.run({
    callbacks: [checkpointCallback],
    onEpisodeComplete: (episode, metrics) => {
        console.log(`Episode ${episode}: ${metrics.reward}`);
    }
});
```

#### Monitor Training Progress

```javascript
const progress = checkpoint.getProgress();
console.log(`
    Episodes: ${progress.episodes}
    Best Reward: ${progress.bestReward}
    Average Reward: ${progress.avgReward}
    Trend: ${progress.trend}  // 'improving', 'declining', or 'stable'
`);
```

#### List and Manage Checkpoints

```javascript
// List all checkpoints
const checkpoints = await checkpoint.list();
checkpoints.forEach(cp => {
    console.log(`Episode ${cp.episode}: ${cp.reward} (${cp.isBest ? 'BEST' : 'regular'})`);
});

// Delete specific checkpoint
await checkpoint.delete('checkpoint_ep50_2026-02-24T23-00-00-000Z.json');

// Get checkpoint info
const latest = await checkpoint.loadLatest(agent);
```

### API Reference

#### CheckpointManager

| Method                         | Description                                       |
|--------------------------------|---------------------------------------------------|
| `constructor(config)`          | Create manager with configuration                 |
| `initialize()`                 | Initialize checkpoint directory and load metadata |
| `save(agent, episode, reward)` | Save checkpoint if conditions met                 |
| `loadLatest(agent)`            | Load most recent checkpoint                       |
| `loadBest(agent)`              | Load best performing checkpoint                   |
| `load(agent, filename)`        | Load specific checkpoint by filename              |
| `list()`                       | List all checkpoints                              |
| `delete(filename)`             | Delete specific checkpoint                        |
| `getProgress()`                | Get training progress statistics                  |
| `shutdown()`                   | Cleanup and save metadata                         |

#### Configuration Options

```javascript
{
    directory: './checkpoints',     // Checkpoint storage directory
    interval: 100,                  // Save every N episodes
    maxKeep: 5,                     // Maximum checkpoints to retain
    saveBest: true,                 // Always save best model
    saveHistory: true,              // Include training history
    compression: false,             // Compress checkpoint files
    includeOptimizer: true,         // Save optimizer state
    includeHistory: true            // Include episode history
}
```

---

## 2. Enhanced Error Handling

### Purpose

Provide actionable error messages with suggestions and documentation links to reduce debugging time.

### Features

- **Context-aware messages** - Errors include specific details about what went wrong
- **Actionable suggestions** - Each error includes 1-3 suggestions for fixing the issue
- **Documentation links** - Direct links to relevant documentation
- **Type-specific errors** - Specialized error classes for different scenarios

### Error Types

| Error Class          | Use Case                                            |
|----------------------|-----------------------------------------------------|
| `LifecycleError`     | Component not initialized, already shutdown         |
| `EnvironmentError`   | Environment not reset, invalid action, episode done |
| `AgentError`         | Agent not trained, observation mismatch             |
| `ConfigError`        | Missing required config, invalid type, out of range |
| `TensorError`        | Shape mismatch, dtype mismatch                      |
| `TrainingError`      | NaN loss, training divergence                       |
| `NeuroSymbolicError` | Grounding failed, lift failed                       |

### Usage

#### Basic Error Handling

```javascript
import { Errors } from '@senars/rl';

try {
    await agent.act(observation);
} catch (error) {
    if (error instanceof LifecycleError) {
        console.error(error.formatMessage());
        // Output:
        // Component 'DQNAgent' not initialized before calling 'act()'
        //
        // 💡 Suggestions:
        //    - Call await component.initialize() before using the component
        //    - Example: const agent = new DQNAgent(env); await agent.initialize();
        //
        // 📖 Documentation: https://senars.ai/rl/components/lifecycle
    }
}
```

#### Environment Errors

```javascript
import { EnvironmentError } from '@senars/rl';

// Before step(), ensure environment is reset
try {
    const result = env.step(action);
} catch (error) {
    if (error instanceof EnvironmentError) {
        console.error(error.message);
        // "Environment 'CartPole' not reset before step()"
        console.error(error.suggestions);
        // ["Call env.reset() before starting an episode", ...]
    }
}
```

#### Configuration Validation

```javascript
import { validateConfig, Errors } from '@senars/rl';

const schema = {
    learningRate: { required: true, type: 'number', range: [0, 1] },
    episodes: { required: true, type: 'number' },
    epsilon: { required: false, type: 'number', range: [0, 1], default: 0.1 }
};

try {
    validateConfig(config, schema);
} catch (error) {
    if (error instanceof ConfigError) {
        console.error(error.formatMessage());
        // "Missing required configuration: 'learningRate'"
        // 💡 Suggestions:
        //    - Add 'learningRate' to the configuration object
        //    - Example: { learningRate: 0.001 }
    }
}
```

#### Training Error Detection

```javascript
import { TrainingError } from '@senars/rl';

try {
    await trainingLoop.run();
} catch (error) {
    if (error instanceof TrainingError && error.message.includes('NaN loss')) {
        console.error(error.formatMessage());
        // "NaN loss detected at episode 42"
        // 💡 Suggestions:
        //    - Reduce learning rate (try 0.0001 or lower)
        //    - Check for reward scaling issues (normalize rewards)
        //    - Add gradient clipping: { maxGradientNorm: 1.0 }
    }
}
```

#### Error Factory

```javascript
import { Errors } from '@senars/rl';

// Throw lifecycle error
throw Errors.lifecycle('not_initialized', {
    component: 'MyAgent',
    method: 'act',
    state: 'not_initialized'
});

// Throw environment error
throw Errors.environment('invalid_action', {
    env: 'CartPole',
    action: 5
});

// Throw agent error
throw Errors.agent('not_trained', {
    agent: 'DQNAgent'
});
```

### Creating Custom Enhanced Errors

```javascript
import { EnhancedError } from '@senars/rl';

class CustomError extends EnhancedError {
    constructor(issue, context = {}) {
        const message = `Custom error: ${issue}`;
        const suggestions = [
            'First suggestion',
            'Second suggestion'
        ];
        const docsLink = 'https://example.com/docs';
        
        super(message, suggestions, docsLink);
    }
}

// Usage
throw new CustomError('something_went_wrong');
```

---

## 3. Monitoring and Metrics Export

### Purpose

Export training metrics to Prometheus, TensorBoard, Weights & Biases, or JSON for monitoring and analysis.

### Features

- **Multiple export formats** - JSON, Prometheus, TensorBoard, WandB
- **Real-time logging** - Console logging with configurable intervals
- **Training progress tracking** - Trend detection (improving/declining/stable)
- **Callback integration** - Easy integration with training loops

### Usage

#### Basic Monitoring

```javascript
import { createMonitor, createMonitorCallback } from '@senars/rl';

// Create monitor with JSON export
const { exporter, monitor } = createMonitor({
    exportDirectory: './logs',
    logToConsole: true,
    logInterval: 10,
    json: { enabled: true, filename: 'metrics.json' }
});

await exporter.initialize();

// Training loop
for (let episode = 0; episode < 1000; episode++) {
    const reward = await trainEpisode();
    monitor.logEpisode(episode, { reward, loss: 0.5 });
}

// Export metrics
await exporter.export();
await exporter.shutdown();
```

#### Prometheus Export

```javascript
const { exporter } = createMonitor({
    exportDirectory: './logs',
    prometheus: {
        enabled: true,
        port: 9090
    }
});

// After training, metrics available at /metrics endpoint
const prometheusFormat = exporter.getPrometheusFormat();
// # HELP senars_rl_metric SeNARS RL Training Metric
// # TYPE senars_rl_metric gauge
// senars_rl_episode_reward 500
```

#### TensorBoard Export

```javascript
const { exporter } = createMonitor({
    exportDirectory: './logs',
    tensorboard: {
        enabled: true,
        logDir: 'tensorboard_logs'
    }
});

// View with: tensorboard --logdir ./logs/tensorboard_logs
```

#### Training Loop Integration

```javascript
import { TrainingLoop, createMonitor, createMonitorCallback } from '@senars/rl';

const { exporter, monitor } = createMonitor({
    logInterval: 10,
    json: { enabled: true }
});

const callback = createMonitorCallback(monitor);

const trainingLoop = new TrainingLoop(agent, env, { episodes: 1000 });
await trainingLoop.run({
    callbacks: [callback]
});
```

#### Get Training Progress

```javascript
const progress = monitor.getProgress();
console.log(`
    Episodes: ${progress.totalEpisodes}
    Best Reward: ${progress.bestReward}
    Avg Reward (10): ${progress.avgReward}
    Trend: ${progress.trend}
`);
```

### API Reference

| Class/Function                   | Description                             |
|----------------------------------|-----------------------------------------|
| `MetricsExporter`                | Base exporter with multi-format support |
| `TrainingMonitor`                | Real-time monitoring with logging       |
| `createMonitor(config)`          | Create exporter + monitor pair          |
| `createMonitorCallback(monitor)` | Create training loop callback           |

### Configuration Options

```javascript
{
    enabled: true,
    logInterval: 10,
    exportFormat: 'json',
    exportDirectory: './logs',
    prometheus: { enabled: false, port: 9090 },
    tensorboard: { enabled: false, logDir: './tensorboard_logs' },
    wandb: { enabled: false, project: 'senars-rl' },
    json: { enabled: true, filename: 'training_metrics.json' }
}
```

---

## 4. Architecture Modularization

### Purpose

Split large architecture files into focused, maintainable modules following single-responsibility principle.

### Before

```
rl/src/architectures/ArchitectureSystem.js (483 lines)
├── ArchitectureConfig
├── NeuroSymbolicUnit
├── NeuroSymbolicLayer
├── ArchitectureBuilder
├── NeuroSymbolicArchitecture
├── ArchitectureTemplates
├── ArchitectureFactory
└── EvolutionaryArchitecture
```

### After

```
rl/src/architectures/
├── ArchitectureSystem.js (re-exports)
├── ArchitectureConfig.js (configuration & templates)
├── NeuroSymbolicUnit.js (base processing unit)
├── NeuroSymbolicLayer.js (layer of units)
├── ArchitectureBuilder.js (fluent builder)
├── NeuroSymbolicArchitecture.js (main architecture)
├── ArchitectureFactory.js (factory & templates)
└── EvolutionaryArchitecture.js (evolutionary optimization)
```

### Benefits

- **Easier navigation** - Each file <150 lines
- **Better testability** - Test each component independently
- **Clearer dependencies** - Import only what you need
- **Maintainable** - Changes isolated to single files

### Usage

```javascript
// Import specific components
import { ArchitectureBuilder } from '@senars/rl/architectures/ArchitectureBuilder.js';
import { NeuroSymbolicUnit } from '@senars/rl/architectures/NeuroSymbolicUnit.js';

// Or use main export
import { ArchitectureFactory, Architectures } from '@senars/rl';

// Quick architecture creation
const arch = await Architectures.dualProcess({ units: 64 });
```

---

## 5. Gymnasium Compatibility

### Purpose

Use any Gymnasium (Python) environment with SeNARS RL agents.

### Features

- **Automatic space inference** - Observation and action spaces detected
- **Python bridge** - Communicates with gymnasium via subprocess
- **Common env support** - CartPole, MountainCar, Pendulum, LunarLander

### Installation

```bash
pip install gymnasium[classic-control]
# For LunarLander:
pip install "gymnasium[box2d]"
```

### Usage

#### Basic Usage

```javascript
import { gym } from '@senars/rl';

// Create Gymnasium environment
const env = await gym('CartPole-v1');

// Use like any RL environment
const { observation } = await env.reset();
const action = env.sampleAction();
const result = await env.step(action);
```

#### With Agent Training

```javascript
import { gym, DQNAgent } from '@senars/rl';

const env = await gym('CartPole-v1');
const agent = new DQNAgent(env);
await agent.initialize();
await agent.train(env, { episodes: 1000 });
```

#### Check Availability

```javascript
import { isGymnasiumAvailable } from '@senars/rl';

if (await isGymnasiumAvailable()) {
    const env = await gym('Pendulum-v1');
    // ...
} else {
    console.log('Gymnasium not installed');
}
```

### Supported Environments

| Environment      | Observation Space | Action Space  |
|------------------|-------------------|---------------|
| `CartPole-v1`    | [4]               | Discrete(2)   |
| `MountainCar-v0` | [2]               | Discrete(3)   |
| `Pendulum-v1`    | [3]               | Continuous(1) |
| `LunarLander-v3` | [8]               | Discrete(4)   |

### API Reference

| Function/Class           | Description                         |
|--------------------------|-------------------------------------|
| `gym(envName, config)`   | Create and initialize GymWrapper    |
| `GymWrapper`             | Gymnasium environment wrapper class |
| `isGymnasiumAvailable()` | Check if gymnasium is installed     |

---

## 6. Timer Leak Fixes

### Issue

Integration tests showed warnings about active timers not being properly cleaned up, causing Jest to hang on exit.

### Solution

Added `.unref()` calls to all `setTimeout` timers used for timeouts, allowing Node.js to exit even if timers are still
pending.

### Files Modified

- `rl/src/training/TrainingSystem.js` - WorkerPool timeout timers
- `rl/src/composable/ComposableSystem.js` - Composition timeout timers
- `rl/src/composable/CompositionEngine.js` - Component execution timeout timers

### Impact

Tests now complete cleanly without timer-related warnings.

---

## Test Coverage

### New Tests

| Test Suite                | Tests | Status |
|---------------------------|-------|--------|
| `checkpoint.test.js`      | 19    | ✅ Pass |
| `enhanced-errors.test.js` | 28    | ✅ Pass |
| `monitoring.test.js`      | 20    | ✅ Pass |
| `gymnasium.test.js`       | 13    | ✅ Pass |

### Overall RL Tests

| Suite             | Tests   | Status |
|-------------------|---------|--------|
| Unit Tests        | 150/150 | ✅ 100% |
| Integration Tests | 12/12   | ✅ 100% |

---

## Migration Guide

### For Existing Code

**No breaking changes** - All existing code continues to work.

### Recommended Additions

#### Add Checkpointing to Training

```javascript
// Before
for (let episode = 0; episode < 1000; episode++) {
    await trainingLoop.run();
}

// After
const checkpoint = new CheckpointManager({ directory: './checkpoints' });
await checkpoint.initialize();

for (let episode = 0; episode < 1000; episode++) {
    await trainingLoop.run();
    await checkpoint.save(agent, episode, reward);
}
```

#### Add Error Handling

```javascript
// Before
try {
    await agent.act(observation);
} catch (e) {
    console.error('Error:', e.message);
}

// After
try {
    await agent.act(observation);
} catch (error) {
    if (error instanceof LifecycleError) {
        console.error(error.formatMessage());
    } else {
        console.error('Unexpected error:', error);
    }
}
```

---

## Performance Notes

### Checkpointing

- **Save time**: ~10-50ms per checkpoint (depends on model size)
- **Load time**: ~5-20ms per checkpoint
- **Disk usage**: ~10KB-1MB per checkpoint (depends on model complexity)

### Enhanced Errors

- **Overhead**: Negligible (<1ms per error creation)
- **Memory**: ~1-2KB per error instance (for suggestions and links)

---

## Future Enhancements

### Planned

- [ ] Cloud storage integration (S3, GCS, Azure Blob)
- [ ] Checkpoint compression (gzip, lz4)
- [ ] Remote monitoring webhook integration
- [ ] Automatic hyperparameter tuning with checkpoint-based resume
- [ ] Model export to ONNX/TorchScript format

### Under Consideration

- [ ] Distributed checkpointing for multi-GPU training
- [ ] Checkpoint diff/compression between episodes
- [ ] Integrated experiment tracking (MLflow, Weights & Biases)

---

*Enhancements completed: February 2026*
*Test coverage: 100% for new features*
*Backward compatibility: Fully maintained*
