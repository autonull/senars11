# SeNARS Usage Guide

## Quick Start

### Prerequisites

- Node.js >= 16.x
- npm >= 7.x

### Installation

Please refer to the [main README](README.md#installation) for installation instructions.

### Basic Usage

```javascript
import { Reasoner, TaskBagPremiseSource, BagStrategy, RuleExecutor, RuleProcessor, Memory } from './core/src/index.js';

// Initialize components
const memory = new Memory();
const premiseSource = new TaskBagPremiseSource(memory, {priority: true});
const strategy = new BagStrategy();
const ruleProcessor = new RuleProcessor(new RuleExecutor());

// Create reasoner
const reasoner = new Reasoner(premiseSource, strategy, ruleProcessor, {
    cpuThrottleInterval: 1,
    maxDerivationDepth: 10
});

// Listen for outputs
reasoner.on('derivation', (task) => {
    console.log(`Derived: ${task.toString()}`);
});

// Start reasoning
reasoner.start();

// Add knowledge
memory.addTask(Task.fromNarsese('(bird --> animal).'));
memory.addTask(Task.fromNarsese('(robin --> bird).'));
// System will derive: (robin --> animal)
```

For detailed configuration options, see [README.config.md](README.config.md).

## Common Workflows

### Running the REPL

Interactive command-line interface for direct system interaction:

```bash
npm run repl
```

Once in the REPL, you can:
- Enter Narsese statements: `(bird --> animal).`
- Ask questions: `(robin --> ?what)?`
- Set goals: `(task_done --> desirable)!`
- Step through reasoning: `step()`
- View memory: `beliefs()`

### Running Demos

Execute predefined demonstrations:

```bash
# Run all demos
node agent/src/demo/demoRunner.js

# Run specific example
node examples/phase10-final-demo.js
```

### Starting the MCP Server

For AI assistant integration:

```bash
node agent/src/mcp/start-server.js
```

This starts a Model Context Protocol server that allows AI assistants to interact with SeNARS.

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Specific test file
npm test -- tests/term/Term.test.js
```

### Starting WebSocket Monitor

For real-time visualization:

```bash
node agent/src/server/WebSocketMonitor.js
```

Then open a browser and connect to see live reasoning visualization.

### Layouts

You can switch between different UI layouts by appending the `layout` parameter to the URL:

*   `?layout=ide`: (Default) Comprehensive view with Notebook, Graph, Memory, and Metrics.
*   `?layout=code`: Dedicated Code Editor (Left) and Output Console (Right).
*   `?layout=repl`: Minimalist full-screen Notebook/REPL.
*   `?layout=canvas`: Large Graph Canvas with a small console at the bottom.
*   `?layout=split`: Simple split view of Editor and Output.

### Features

*   **Notebook**: Interactive cells for Narsese/MeTTa input. Supports drag-and-drop, duplication, and undo.
*   **Code Editor**: Standalone editor with syntax highlighting, file load/save, and auto-run capability.
*   **Knowledge Graph**: Interactive visualization of concepts and links.
*   **Shortcuts**:
    *   `Shift+Enter`: Execute cell/code
    *   `Ctrl+L`: Clear outputs
    *   `Ctrl+S`: Save notebook (localStorage)

## Text User Interface (TUI)

The REPL provides an interactive command-line interface built with Ink (React for CLI).

### Basic Commands

| Command | Description |
|---------|-------------|
| `(term).` | Add a belief |
| `(term)!` | Add a goal |
| `(term)?` | Ask a question |
| `step()` | Execute one reasoning step |
| `step(N)` | Execute N reasoning steps |
| `beliefs()` | Show all beliefs |
| `concepts()` | Show all concepts |
| `help()` | Show help |
| `exit()` | Exit REPL |
`
Note: The REPL provides tab completion for commmands and history navigation with arrow keys.

### Example REPL Session

```
> (bird --> animal).
✓ Added belief: (bird --> animal)

> (robin --> bird).
✓ Added belief: (robin --> bird)

> step(5)
Cycle 1: (robin --> animal). [derived]
Cycle 2: ...
...

> (robin --> ?what)?
? Querying: (robin --> ?what)
✓ Answer: (robin --> animal) {0.81, 0.73}
✓ Answer: (robin --> bird) {1.0, 0.9}

> beliefs()
(bird --> animal) {1.0, 0.9}
(robin --> bird) {1.0, 0.9}
(robin --> animal) {0.81, 0.73}
```

## Advanced Usage

### Custom Configuration

```javascript
const reasoner = new Reasoner(premiseSource, strategy, ruleProcessor, {
    cpuThrottleInterval: 5,      // Slower, less CPU intensive
    maxDerivationDepth: 20,      // Allow deeper reasoning chains
    resourceLimits: {
        maxMemory: 1024,         // MB
        maxTimePerCycle: 200     // ms
    }
});
```

### Event Handling

```javascript
// Listen for specific events
reasoner.on('derivation', (task) => {
    console.log(`New inference: ${task.toString()}`);
});

reasoner.on('answer', (question, answer) => {
    console.log(`Q: ${question.toString()}`);
    console.log(`A: ${answer.toString()}`);
});

reasoner.on('metrics', ({ derivationsPerSecond, memoryUsage }) => {
    console.log(`Performance: ${derivationsPerSecond}/s, ${memoryUsage}MB`);
});
```

## Common Issues

### "Module not found" errors

**Solution**: Ensure you've run `npm install` and `npm run build`

```bash
npm install
npm run build
```

### Tests failing

**Solution**: Check Node.js version (requires >= 16.x)

```bash
node --version  # Should be >= 16.x
npm test
```

### REPL not responding

**Solution**: Check if reasoning loop is blocked. Try reducing `cpuThrottleInterval`:

```javascript
const reasoner = new Reasoner(/* ... */, {
    cpuThrottleInterval: 10  // Increase to reduce CPU load
});
```

### Out of memory errors

**Solution**: Reduce memory capacity or increase forgetting rate:

```javascript
const config = {
    memory: {
        capacity: 500,  // Reduce from default 1000
        consolidationThreshold: 0.2  // Increase forgetting
    }
};
```
