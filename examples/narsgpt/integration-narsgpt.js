/**
 * NARS-GPT Integration Example
 * Demonstrates using NARS-GPT for conversational question-answering with memory.
 */

import {NAR, NarsGPTStrategy, createNarsGPTBeliefRule, createNarsGPTQARule, EmbeddingLayer, EventBus} from '@senars/nar';

console.log('NARS-GPT Integration Example\n' + '='.repeat(40));

// 1. Setup
const nar = new NAR();
const eventBus = new EventBus();
const embeddingLayer = new EmbeddingLayer({model: 'mock'});

const strategy = new NarsGPTStrategy({
    embeddingLayer,
    eventBus,
    relevantViewSize: 20,
    recentViewSize: 10,
    perspectiveMode: 'neutralize' // Use 3rd-person for knowledge representation
});

// 2. Create mock LM (replace with real LM in production)
const mockLM = {
    generateText: async (prompt) => {
        console.log(`\n[LM Query]`);
        if (prompt.includes('What color')) return 'The sky is blue.';
        if (prompt.includes('Encode')) return '(sky --> blue). {0.9 0.9}';
        return 'I don\'t know.';
    }
};

// 3. Create rules
const qaRule = createNarsGPTQARule({
    lm: mockLM,
    narsGPTStrategy: strategy,
    parser: nar.parser,
    eventBus,
    memory: nar.mem
});

const beliefRule = createNarsGPTBeliefRule({
    lm: mockLM,
    narsGPTStrategy: strategy,
    parser: nar.parser,
    eventBus,
    memory: nar.mem
});

// 4. Add knowledge to memory
console.log('\n[1] Adding knowledge...');
nar.input('(sky --> object).');
nar.input('(ocean --> blue).');
nar.input('(grass --> green).');

await strategy.ground('(sky --> object)', 'The sky is an object');
await strategy.ground('(ocean --> blue)', 'The ocean is blue');
console.log(`  Groundings: ${strategy.groundings.size}`);

// 5. Build attention buffer (demonstrate semantic retrieval)
console.log('\n[2] Attention buffer (semantic retrieval)...');
const buffer = await strategy.buildAttentionBuffer('sky color', nar.mem, Date.now());

console.log(`  Items retrieved: ${buffer.length}`);
buffer.forEach((item, i) => {
    const score = `relevance:${item.relevance?.toFixed(2) ?? 0} recency:${item.recency?.toFixed(2) ?? 0}`;
    console.log(`    ${i + 1}. ${item.task.term} (${score})`);
});

// 6. Demonstrate perspective transformation
console.log('\n[3] Perspective transformation...');
const examples = [
    'You are learning NARS',
    'I understand the system'
];

strategy.perspectiveMode = 'swap';
examples.forEach(text => {
    console.log(`  Original: "${text}"`);
    console.log(`  Swap:     "${strategy.perspectiveSwap(text)}"`);
});

strategy.perspectiveMode = 'neutralize';
examples.forEach(text => {
    console.log(`  Neutral:  "${strategy.perspectiveNeutralize(text)}"`);
});

// 7. Show metrics
console.log('\n[4] Strategy metrics:');
const metrics = strategy.metrics;
console.log(`  Attention buffers built: ${metrics.attentionBufferBuilds}`);
console.log(`  Atomizations: ${metrics.atomizations}`);
console.log(`  Grounding checks: ${metrics.groundingChecks}`);
console.log(`  Perspective ops: ${metrics.perspectiveOps}`);

console.log('\n' + '='.repeat(40));
console.log('✓ Integration example complete');
console.log('\nNext steps:');
console.log('  - Replace mockLM with real LM provider');
console.log('  - Configure embedding model for production');
console.log('  - Add more domain knowledge');
console.log('  - Enable EventBus logging for observability');
