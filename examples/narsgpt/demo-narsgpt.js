/**
 * NARS-GPT Demo - SeNARS Integration
 * Demonstrates attention buffer, atomization, grounding, and perspective transformation.
 */

import {NarsGPTStrategy, createNarsGPTQARule, NarsGPTPrompts, EmbeddingLayer} from '@senars/nar';

const section = (title) => console.log(`\n${title}`);
const show = (label, value) => console.log(`  ${label}: ${value}`);

section('═'.repeat(60) + '\nNARS-GPT Demo\n' + '═'.repeat(60));

// Setup
const embeddingLayer = new EmbeddingLayer({model: 'mock'});
const strategy = new NarsGPTStrategy({
    embeddingLayer,
    relevantViewSize: 20,
    recentViewSize: 10,
    atomCreationThreshold: 0.95,
    weights: {relevance: 0.7, recency: 0.3}
});

// 1. Perspective Transformation
section('[1] Perspective Transformation');
const examples = ['You are smart', 'I like your cat', 'My dog is friendly'];

console.log('  Mode: swap (I ↔ You)');
examples.forEach(text => show(`    "${text}"`, `"${strategy.perspectiveSwap(text)}"`));

strategy.perspectiveMode = 'neutralize';
console.log('\n  Mode: neutralize (→ 3rd person)');
examples.forEach(text => show(`    "${text}"`, `"${strategy.perspectiveNeutralize(text)}"`));
strategy.perspectiveMode = 'swap';

// 2. Atomization (Term Deduplication)
section('[2] Atomization');
for (const term of ['cat', 'dog', 'cat', 'feline']) {
    const {isNew, unifiedTerm} = await strategy.atomize(term, 'NOUN');
    show(`  "${term}"`, isNew ? 'NEW ATOM' : `UNIFIED → "${unifiedTerm}"`);
}

// 3. Grounding
section('[3] Grounding');
await strategy.ground('(bird --> animal)', 'Birds are animals');
await strategy.ground('(cat --> pet)', 'Cats are pets');
show('  Registered', strategy.groundings.size);

const checks = [
    ['Birds are animals', await strategy.checkGrounding('Birds are animals')],
    ['Fish can swim', await strategy.checkGrounding('Fish can swim')]
];
checks.forEach(([text, r]) => show(`  "${text}"`, `grounded: ${r.grounded}${r.match ? `, match: ${r.match}` : ''}`));

// 4. Negated Belief Formatting
section('[4] Negated Belief Formatting');
const mockBuffer = [
    {task: {term: {toString: () => '(bird --> flyer)'}, truth: {f: 0.9, c: 0.8}}},
    {task: {term: {toString: () => '(penguin --> bird)'}, truth: {f: 1.0, c: 0.95}}},
    {task: {term: {toString: () => '(penguin --> flyer)'}, truth: {f: 0.1, c: 0.7}}} // Negated!
];
console.log(NarsGPTPrompts.formatBuffer(mockBuffer).split('\n').map(l => '  ' + l).join('\n'));

// 5. Metrics
section('[5] Strategy Metrics');
const m = strategy.metrics;
show('  Atomizations', m.atomizations);
show('  Grounding checks', m.groundingChecks);
show('  Perspective ops', m.perspectiveOps);

// 6. Rule Factory
section('[6] Rule Factory');
const qa = createNarsGPTQARule({
    lm: {generateText: async () => '(bird --> animal). {0.9 0.9}'},
    narsGPTStrategy: strategy
});
show('  Created', `"${qa.id}" (${qa.config.name})`);

section('═'.repeat(60) + '\n✓ Demo Complete\n' + '═'.repeat(60));
section(`
Features:
  • Attention buffer (relevance + recency weighting)
  • Term atomization (embedding-based deduplication)
  • Grounding verification (sentence→Narsese mappings)
  • Perspective swap & neutralization
  • Negated belief formatting (f < 0.5 → "NOT: ...")
  • NAL truth revision for LM outputs
`);
