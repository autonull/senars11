# NARS-GPT Strategy

NARS-GPT style premise formation strategy combining embedding-based retrieval with NARS reasoning.

## Features

### Core (from [original NARS-GPT](https://github.com/opennars/NARS-GPT))

- **Attention Buffer**: Relevance (embedding similarity) + recency weighting
- **Atomization**: Term deduplication via embedding similarity threshold
- **Grounding**: Sentence→Narsese mapping with verification
- **Eternalization**: Temporal→eternal belief conversion
- **Perspective Swap**: I↔You pronoun exchange

### SeNARS Enhancements

- **Perspective Neutralization**: 3rd-person conversion ("you" → "one")
- **Batch Embedding**: Efficient similarity computation
- **EventBus Integration**: Observability events
- **NAL Truth Revision**: Memory-based confidence adjustment
- **Configurable Thresholds**: Relevance and grounding cutoffs

## Quick Start

```javascript
import { NarsGPTStrategy } from './core/src/reason/strategy/NarsGPTStrategy.js';
import { EmbeddingLayer } from './core/src/lm/EmbeddingLayer.js';

const strategy = new NarsGPTStrategy({
  embeddingLayer: new EmbeddingLayer({ model: 'mock' }),
  relevantViewSize: 30,
  recentViewSize: 10,
  perspectiveMode: 'swap' // or 'neutralize' | 'none'
});

// Atomization
const { isNew, unifiedTerm } = await strategy.atomize('cat', 'NOUN');

// Grounding
await strategy.ground('(bird --> animal)', 'Birds are animals');
const { grounded, match } = await strategy.checkGrounding('Birds are animals');

// Perspective transformation
strategy.perspectiveSwap('you are smart'); // → "I am smart"
strategy.perspectiveNeutralize('you are smart'); // → "one is smart"
```

## Configuration

```javascript
new NarsGPTStrategy({
  embeddingLayer,        // Required: EmbeddingLayer instance
  eventBus,              // Optional: EventBus for observability
  relevantViewSize: 30,  // Max relevant items from semantic search
  recentViewSize: 10,    // Max recent items by timestamp
  atomCreationThreshold: 0.95, // Similarity for term unification
  eternalizationDistance: 3,   // Steps before eternalization
  perspectiveMode: 'swap',     // 'swap' | 'neutralize' | 'none'
  relevanceThreshold: 0.3,     // Min similarity for relevance
  groundingThreshold: 0.8,     // Min similarity for grounding match
  weights: { relevance: 0.7, recency: 0.3 }
});
```

## Usage with LM Rules

```javascript
import { createNarsGPTQARule, createNarsGPTBeliefRule, createNarsGPTGoalRule } from './core/src/reason/rules/lm/index.js';

const qaRule = createNarsGPTQARule({ lm, narsGPTStrategy, parser, eventBus, memory });
const beliefRule = createNarsGPTBeliefRule({ lm, narsGPTStrategy, parser, eventBus, memory });
const goalRule = createNarsGPTGoalRule({ lm, narsGPTStrategy, parser, eventBus, memory });
```

## Events

```javascript
eventBus.on('narsgpt:candidates', ({ query, bufferSize }) => { /* ... */ });
eventBus.on('narsgpt:atomCreated', ({ term, type }) => { /* ... */ });
eventBus.on('narsgpt:atomUnified', ({ term, unifiedTo, similarity }) => { /* ... */ });
eventBus.on('narsgpt:grounded', ({ narsese, sentence }) => { /* ... */ });
eventBus.on('narsgpt:eternalized', ({ count }) => { /* ... */ });
```

## Architecture

```
Input → Perspective Transform → NarsGPTStrategy
                                      ↓
                         Attention Buffer (relevant + recent)
                                      ↓
                         [Atomization] [Grounding] [Eternalization]
                                      ↓
                         LM Rules (QA/Belief/Goal)
```

## See Also

- [Demo](file:///home/me/senars10/examples/demo-narsgpt.js) - Complete feature demonstration
- [Tests](file:///home/me/senars10/tests/unit/reason/strategy/NarsGPTStrategy.test.js) - Unit tests
- [Original NARS-GPT](https://github.com/opennars/NARS-GPT) - Python implementation
