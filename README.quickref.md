# SeNARS Quick Reference

## I want to...

| Goal | Command / Location |
|------|-------------------|
| Run reasoning | `const nar = new NAR(); nar.input('(a --> b).');` |
| Start REPL | `npm run repl` |
| Run demos | `node agent/src/demo/demoRunner.js` |
| Start MCP server | `node agent/src/mcp/start-server.js` |
| Run all tests | `npm test` |
| Start WebSocket monitor | `node agent/src/server/WebSocketMonitor.js` |

## Subsystems

| System | Location | Purpose |
|--------|----------|---------|
| **Core NAR** | `core/src/nar/NAR.js` | Main reasoning API |
| **Strategies** | `core/src/reason/strategy/` | Premise selection algorithms |
| **Rules** | `core/src/reason/rules/nal/` | NAL inference rules |
| **LM Integration** | `core/src/lm/` | Language model providers, embeddings |
| **MCP Server** | `agent/src/mcp/` | AI assistant integration |
| **Demo System** | `agent/src/demo/` | Remote-controlled demos |
| **RLFP** | `agent/src/rlfp/` | Learn from preferences |
| **Knowledge** | `agent/src/know/` | KB connectors, templates |
| **REPL** | `agent/src/bin/cli.js` | Ink-based TUI |
| **Web UI** | `ui/src/` | React-based interface |

## Narsese Syntax

### Operators

| Operator | Symbol | Example | Meaning |
|----------|--------|---------|---------|
| **Inheritance** | `-->` | `(robin --> bird)` | Robin is a type of bird |
| **Similarity** | `<->` | `(cat <-> dog)` | Cat is similar to dog |
| **Implication** | `==>` | `(rain ==> wet)` | Rain implies wetness |
| **Equivalence** | `<=>` | `(A <=> B)` | A is equivalent to B |
| **Conjunction** | `&&` or `&` | `(A && B)` | A and B |
| **Disjunction** | `\|\|` or `\|` | `(A \|\| B)` | A or B |
| **Negation** | `--` | `(--A)` | Not A |
| **Product** | `*` | `(A * B)` | Product of A and B |
| **Image Ext** | `/` | `(/R _ B)` | Extension image |
| **Image Int** | `\\` | `(\\R A _)` | Intension image |

### Punctuation

| Symbol | Type | Meaning | Example |
|--------|------|---------|---------|
| `.` | Belief | A statement of fact | `(bird --> animal).` |
| `?` | Question | A query | `(robin --> ?what)?` |
| `!` | Goal | A desired state | `(task_done --> desirable)!` |

### Truth Values

Format: `{frequency, confidence}`

- **Frequency**: How often something is true (0.0 to 1.0)
- **Confidence**: How certain we are (0.0 to 1.0)

Examples:
- `{1.0, 0.9}` - Very confident it's true
- `{0.5, 0.5}` - Uncertain
- `{0.0, 0.8}` - Confident it's false

### Variables

| Type | Symbol | Example | Meaning |
|------|--------|---------|---------|
| Query Variable | `?` | `(robin --> ?X)?` | What is robin? |
| Independent Variable | `$` | `($X --> bird)` | Something is a bird |
| Dependent Variable | `#` | `(#X --> #X)` | Reflexive relation |

## Verification

```bash
npm test                    # All tests (99.8% pass rate)
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
node examples/phase10-final-demo.js  # Full system demo
```

## Common Patterns

### Basic Reasoning

```javascript
import { NAR } from './core/src/nar/NAR.js';

const nar = new NAR();
nar.on('output', (task) => console.log(task.toString()));
nar.input('(bird --> animal).');
nar.input('(robin --> bird).');
nar.step();  // Derives: (robin --> animal)
```

### Stream Reasoner Construction

```javascript
import { Reasoner, TaskBagPremiseSource, BagStrategy, RuleExecutor, RuleProcessor } from './src';

const reasoner = new Reasoner(
    new TaskBagPremiseSource(memory, {priority: true}), 
    new BagStrategy(), 
    new RuleProcessor(new RuleExecutor()),
    { cpuThrottleInterval: 1, maxDerivationDepth: 10 }
);
reasoner.start();
```

### Question Answering

```javascript
nar.input('(bird --> animal).');
nar.input('(robin --> bird).');
nar.input('(robin --> ?what)?');  // Query with variable
// Answers: (robin --> animal)
```

### Goal Processing

```javascript
nar.input('(task_done --> desirable)!');  // Set goal
nar.input('(action --> task_done).');      // Belief about how to achieve it
// System will derive plans to achieve the goal
```

### Event Handling

```javascript
reasoner.on('derivation', (task) => {
    console.log(`Derived: ${task.toString()}`);
});

reasoner.on('answer', (question, answer) => {
    console.log(`Q: ${question}, A: ${answer}`);
});

reasoner.on('metrics', ({ derivationsPerSecond }) => {
    console.log(`Rate: ${derivationsPerSecond}/s`);
});
```

### Error Handling

```javascript
try {
    nar.input('(invalid syntax');
} catch (error) {
    console.error('Parse error:', error.message);
}

// Circuit breaker for LM failures
reasoner.on('lm_failure', ({ provider, error }) => {
    console.warn(`LM ${provider} failed, falling back`);
});
```

## Troubleshooting Quick Fixes

| Issue | Quick Fix |
|-------|-----------|
| Module not found | `npm install && npm run build` |
| Tests failing | Check Node version: `node --version` (need >= 16.x) |
| REPL not responding | Increase `cpuThrottleInterval` in config |
| Out of memory | Reduce `memory.capacity` in config |
| Slow reasoning | Increase `cpuThrottleInterval` for responsiveness |

See [README.usage.md](README.usage.md) for more detailed usage instructions and troubleshooting.
