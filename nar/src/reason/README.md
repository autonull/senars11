# SeNARS Stream Reasoner

The SeNARS Stream Reasoner is a continuous, stream-based dataflow architecture that transforms streams of premises into
streams of conclusions. This architecture enables hybrid neuro-symbolic reasoning with NAL (Non-Axiomatic Logic) and
Language Models (LM) in a resource-aware, continuous processing pipeline.

## Architecture Overview

```
+------------------+      +------------------+
|  PremiseSource   |<-----|      Layer       |
| (e.g., TaskBag)  |      | (Term/Embedding) |
| - Sampling       |      +------------------+
+------------------+
         | (Stream of primary premises)
         v
+------------------+      +------------------+
|    Reasoner      |----->|     Strategy     |
|------------------|      |------------------|
| - Start/Stop/Step|      | - Premise Pairing|
| - CPU Throttle   |      | - Budget Mgmt    |
| - Output Stream  |      +------------------+
+------------------+
         | (Stream of premise pairs)
         v
+------------------+      +------------------+
|  RuleProcessor   |----->|  RuleExecutor   |
| (Async Pipeline) |      |------------------|
+------------------+      | - Guard Analysis |
         |                | - Indexing (Trie)|
         | (Dispatches to Rules)
         |
+--------v--------+
|      Rules      |
| - NAL (sync)    |
| - LM (async)    |
+-----------------+
         | (Results from sync & async rules)
         |
         +------------------> Merged into Reasoner's Output Stream
```

## Core Components

### PremiseSource

The `PremiseSource` generates a continuous stream of `Task`s, drawing from `Memory` based on tunable sampling
objectives.

#### Built-in Implementations:

- `TaskBagPremiseSource`: Samples from a priority bag with configurable strategies
- `PremiseSources`: A bag of multiple `PremiseSource`s that samples proportionally

#### Sampling Objectives:

- `priority`: Sample tasks based on their priority value (default: true)
- `recency`: Favor tasks that are closest to a target time (default: false)
- `punctuation`: Focus on Goals (`!`) or Questions (`?`) (default: false)
- `novelty`: Favor tasks with fewer reasoning steps (lower derivation depth) (default: false)
- `dynamic`: Enable performance-based strategy adaptation (default: false)

### Strategy

The `Strategy` component receives the stream of primary premises and creates premise pairs by finding suitable secondary
premises using various selection algorithms. Different strategy implementations provide different reasoning approaches:

- **BagStrategy**: NARS-style priority-sampled bag approach for anytime reasoning
- **ExhaustiveStrategy**: Comprehensive search for all related beliefs for a given task
- **PrologStrategy**: Goal-driven backward chaining with Prolog-style unification and resolution
- **ResolutionStrategy**: Goal-driven backward chaining for Prolog-like resolution, e.g., question answering

### RuleExecutor

The `RuleExecutor` indexes all registered rules for fast retrieval and performs symbolic guard analysis to optimize rule
execution through:

- Deduplication & ordering of common checks
- Subsumption detection
- Constant folding

### RuleProcessor

The `RuleProcessor` consumes premise pairs and executes rules in a non-blocking fashion:

- Synchronous NAL rules are executed immediately and results are emitted
- Asynchronous LM rules are dispatched without blocking and results are emitted when available
- Results are merged into a unified output stream

### Reasoner

The main `Reasoner` class manages the continuous reasoning pipeline:

- Manages pipeline lifecycle with `start()`, `stop()`, `step()` methods
- Exposes a single `outputStream` for consumers
- Implements resource constraints (CPU throttling, derivation depth limits)

## Usage Examples

### Basic Setup

```javascript
import {TaskBagPremiseSource, Strategy, RuleExecutor, RuleProcessor, Reasoner} from './src/reason/index.js';

// Create components
const memory = /* your memory instance */;
const premiseSource = new TaskBagPremiseSource(memory, {
    priority: true,
    recency: false,
    punctuation: false,
    novelty: false
});
const strategy = new Strategy();
const ruleExecutor = new RuleExecutor();
const ruleProcessor = new RuleProcessor(ruleExecutor);

// Create reasoner
const reasoner = new Reasoner(premiseSource, strategy, ruleProcessor, {
    maxDerivationDepth: 10,
    cpuThrottleInterval: 1
});

// Start continuous reasoning
reasoner.start();

// Or run a single step
const result = await reasoner.step();

// Access metrics
const metrics = reasoner.getMetrics();
```

### Configuring Sampling Strategies

```javascript
// Dynamic adaptation with multiple objectives
const premiseSource = new TaskBagPremiseSource(memory, {
    priority: true,
    recency: true,
    punctuation: true,
    novelty: true,
    dynamic: true,  // Enable performance-based adaptation
    weights: {
        priority: 1.0,
        recency: 0.5,
        punctuation: 0.8,
        novelty: 0.3
    }
});
```

### Accessing Pipeline Information

```javascript
// Get current state
const state = reasoner.getState();

// Get debugging information
const debugInfo = reasoner.getDebugInfo();

// Get performance metrics
const perfMetrics = reasoner.getPerformanceMetrics();

// Get component status
const componentStatus = reasoner.getComponentStatus();
```

## Resource Management

The Stream Reasoner implements several resource management features:

### CPU Throttling

- Configurable CPU throttle interval to prevent blocking the event loop
- Adjustable based on system load and consumer feedback

### Derivation Depth Limits

- Configurable maximum derivation depth to keep the derivation graph finite
- Tasks exceeding the limit are discarded to comply with AIKR (Assumption of Insufficient Knowledge and Resources)

### Backpressure Handling

- Advanced detection when output consumers slow down
- Adaptive processing rate adjustments
- Consumer feedback mechanisms to adjust processing based on downstream capacity

## Event-Driven Architecture

The reasoner supports an event-driven notification system for:

- Premise processing events
- Rule application events
- Result generation events

## Testing

The Stream Reasoner includes comprehensive testing:

- Unit tests for individual components
- Integration tests for component interactions
- End-to-end workflow tests
- Property-based tests for edge cases
- Regression tests to ensure stable behavior

## Self-Optimization Hooks

The architecture provides hooks for metacognitive control:

- Sampling objectives serve as direct control knobs
- Derivation graphs in `Stamp`s enable credit assignment
- Performance metrics enable system optimization

## Key Benefits

- **Continuous Processing**: Operates as a non-blocking pipeline processing information as it becomes available
- **Resource Awareness**: Explicitly manages computational resources for stable long-term operation
- **Hybrid Reasoning**: Seamlessly integrates NAL and LM reasoning in a unified architecture
- **Scalability**: Designed for autonomous, long-running operation with proper resource management
- **Observability**: Comprehensive metrics and introspection capabilities
- **Extensibility**: Flexible architecture supporting custom premise sources, strategies, and rule types

## Design Principles

The SeNARS Stream Reasoner follows several core design principles:

- **Continuous Processing**: The system operates as a non-blocking pipeline, processing information as it becomes
  available rather than in discrete iterations.

- **Resource Awareness**: Explicit management of computational resources (CPU, memory, derivation depth) ensures stable,
  long-term operation in accordance with the Assumption of Insufficient Knowledge and Resources (AIKR).

- **Hybrid Reasoning**: Seamless integration of NAL and LM reasoning in a unified architecture allows leveraging the
  strengths of both symbolic and sub-symbolic approaches.

- **Extensibility**: The modular design with pluggable components (premise sources, strategies, rules) enables
  customization for different reasoning tasks and domains.

- **Observability**: Comprehensive metrics and introspection capabilities provide visibility into the reasoning process
  for debugging and optimization.

- **Strategy Pattern Implementation**: The use of the Strategy pattern for premise pairing allows for different
  reasoning approaches (NARS-style, exhaustive, Prolog-style) to be easily swapped and extended.

## PrologStrategy

The PrologStrategy component provides full Prolog-style reasoning capabilities within the SeNARS framework:

- **Backward Chaining Resolution**: Implements goal-driven reasoning by working backwards from questions to find
  supporting facts or rules.

- **Unification with Variable Binding**: Full Prolog-style unification algorithm that binds variables during the
  resolution process, including occurs check to prevent circular bindings.

- **Backtracking**: Supports backtracking to find multiple solutions to a query, with configurable limits on depth and
  number of solutions.

- **Knowledge Base Management**: Maintains an internal knowledge base of facts and rules that can be queried during
  resolution, with predicate-based indexing for efficient lookup.

- **Integration with PrologParser**: Uses the PrologParser to convert between Prolog syntax and SeNARS internal
  representations for facts and rules.

- **Compound Term Handling**: Properly handles complex compound terms with nested structures during unification and
  resolution.

The PrologStrategy extends the base Strategy class and overrides the premise selection method to implement Prolog-style
resolution when dealing with question tasks, while falling back to general reasoning for other task types. It maintains
a goal stack for backtracking and a substitution stack for tracking variable bindings during the resolution process.

## Possibilities

The SeNARS Stream Reasoner architecture opens up several possibilities for future development:

- **Advanced Logic Programming**: Extension to support other logic programming paradigms like Datalog, Answer Set
  Programming, or Constraint Logic Programming through additional strategy implementations.

- **Enhanced Prolog Capabilities**: Improvements to the PrologStrategy to support more advanced Prolog features like
  cuts, advanced term manipulation, or constraint solving.

- **Dynamic Strategy Selection**: Implementation of meta-reasoning capabilities to dynamically select the most
  appropriate strategy based on the current reasoning context or performance metrics.

- **Distributed Reasoning**: Extension of the pipeline architecture to support distributed reasoning across multiple
  nodes or systems.

- **Learning Strategies**: Integration of machine learning techniques to learn and optimize reasoning strategies based
  on past performance and outcomes.

- **Domain-Specific Reasoning**: Development of specialized strategies and rule sets for specific domains like
  scientific reasoning, planning, or natural language understanding.

## Other Helpful Details

- **Event-Driven Architecture**: The reasoner supports an event-driven notification system for premise processing, rule
  applications, and result generation.

- **Comprehensive Testing**: Includes unit tests, integration tests, end-to-end workflow tests, property-based tests,
  and regression tests to ensure reliability.

- **Self-Optimization Hooks**: Provides hooks for metacognitive control through sampling objectives, derivation graphs
  for credit assignment, and performance metrics.

- **Performance Monitoring**: Built-in CPU throttling, derivation depth limits, and backpressure handling ensure stable
  operation under varying loads.