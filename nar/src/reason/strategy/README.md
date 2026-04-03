# Premise Formation Strategies

Strategies control how premise pairs are selected for inference rules.

## Available Strategies

### Core Strategies

#### [BagStrategy](file:///home/me/senars10/core/src/reason/strategy/BagStrategy.js)

Priority-based selection using the concept bag.

#### [ExhaustiveStrategy](file:///home/me/senars10/core/src/reason/strategy/ExhaustiveStrategy.js)

Tries all possible pairings (use with caution).

#### [ResolutionStrategy](file:///home/me/senars10/core/src/reason/strategy/ResolutionStrategy.js)

NARS-style goal-driven backward chaining.

### Advanced Strategies

#### [NarsGPTStrategy](file:///home/me/senars10/core/src/reason/strategy/NarsGPTStrategy.js)

Embedding-based retrieval with attention buffer.
See [NARSGPT.md](file:///home/me/senars10/core/src/reason/strategy/NARSGPT.md) for details.

Features:

- Attention buffer (relevance + recency)
- Term atomization via embeddings
- Grounding verification
- Perspective transformation

#### [DecompositionStrategy](file:///home/me/senars10/core/src/reason/strategy/DecompositionStrategy.js)

Breaks down compound terms for focused inference.

#### [TermLinkStrategy](file:///home/me/senars10/core/src/reason/strategy/TermLinkStrategy.js)

Uses term linkage for premise selection.

#### [TaskMatchStrategy](file:///home/me/senars10/core/src/reason/strategy/TaskMatchStrategy.js)

Matches tasks by content similarity.

## Usage

```javascript
import { BagStrategy, NarsGPTStrategy } from './core/src/reason/strategy/index.js';

// Basic priority-based
const strategy1 = new BagStrategy({ priority: 0.8 });

// NARS-GPT with embeddings
const strategy2 = new NarsGPTStrategy({
  embeddingLayer,
  relevantViewSize: 30,
  perspectiveMode: 'neutralize'
});
```

## See Also

- [Strategy Pattern](file:///home/me/senars10/core/src/reason/strategy/PremiseFormationStrategy.js) - Base class
- [NARS-GPT Guide](file:///home/me/senars10/core/src/reason/strategy/NARSGPT.md) - Detailed NarsGPT docs
- [Examples](file:///home/me/senars10/examples/) - Integration demos
