/**
 * Production NARS-GPT Example with OpenAI
 * Demonstrates integration with OpenAI API for advanced reasoning.
 */

import {NAR, NarsGPTStrategy, createNarsGPTBeliefRule, createNarsGPTGoalRule, createNarsGPTQARule, EmbeddingLayer, LangChainProvider, EventBus} from '@senars/nar';

// Configuration
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL_NAME = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

if (!API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable not set');
    console.log('Usage: OPENAI_API_KEY=your-key node examples/narsgpt/production-openai.js');
    process.exit(1);
}

console.log('Production NARS-GPT with OpenAI\n' + '='.repeat(50));

// 1. Initialize components
const nar = new NAR();
const eventBus = new EventBus();

// 2. Setup OpenAI provider
console.log(`[1] Connecting to OpenAI (model: ${MODEL_NAME})...`);
const lm = new LangChainProvider({
    provider: 'openai',
    modelName: MODEL_NAME,
    apiKey: API_KEY,
    temperature: 0.2, // Lower temperature for more consistent reasoning
    maxTokens: 500
});

// 3. Setup embedding layer
console.log('[2] Initializing embedding layer...');
const embeddingLayer = new EmbeddingLayer({
    model: 'mock' // TODO: Use OpenAI embeddings API
});

// 4. Create NARS-GPT strategy with production settings
console.log('[3] Creating NARS-GPT strategy...');
const strategy = new NarsGPTStrategy({
    embeddingLayer,
    eventBus,
    relevantViewSize: 30,
    recentViewSize: 15,
    perspectiveMode: 'neutralize',
    relevanceThreshold: 0.4,
    groundingThreshold: 0.85,
    weights: {relevance: 0.75, recency: 0.25}
});

// 5. Comprehensive EventBus logging
console.log('[4] Setting up observability...');
const logEvent = (name) => (data) => console.log(`  [${name}]`, JSON.stringify(data, null, 2));

['candidates', 'atomCreated', 'atomUnified', 'grounded', 'eternalized'].forEach(event => {
    eventBus.on(`narsgpt:${event}`, logEvent(event));
});

// 6. Create all NARS-GPT rules
console.log('[5] Creating NARS-GPT rules (QA, Belief, Goal)...');
const qaRule = createNarsGPTQARule({lm, narsGPTStrategy: strategy, parser: nar.parser, eventBus, memory: nar.mem});
const beliefRule = createNarsGPTBeliefRule({
    lm,
    narsGPTStrategy: strategy,
    parser: nar.parser,
    eventBus,
    memory: nar.mem
});
const goalRule = createNarsGPTGoalRule({lm, narsGPTStrategy: strategy, parser: nar.parser, eventBus, memory: nar.mem});

console.log(`  Rules created: ${qaRule.id}, ${beliefRule.id}, ${goalRule.id}`);

// 7. Example: Medical domain knowledge
console.log('\n[6] Medical domain example...');
nar.input('(aspirin --> medication).');
nar.input('(ibuprofen --> medication).');
nar.input('(medication --> painkiller). {0.8 0.9}');
nar.input('(fever --> symptom).');

await strategy.ground('(aspirin --> medication)', 'Aspirin is a medication');
await strategy.ground('(fever --> symptom)', 'Fever is a symptom');

// 8. Demonstrate perspective neutralization
console.log('\n[7] Perspective transformation...');
const patientStatements = [
    'I have a headache',
    'You should take aspirin',
    'My fever is high'
];

patientStatements.forEach(stmt => {
    const neutral = strategy.perspectiveNeutralize(stmt);
    console.log(`  "${stmt}" → "${neutral}"`);
});

// 9. Build attention buffer
console.log('\n[8] Attention buffer retrieval...');
const buffer = await strategy.buildAttentionBuffer('medication for pain', nar.mem, Date.now());
console.log(`  Retrieved ${buffer.length} items:`);
buffer.slice(0, 5).forEach((item, i) => {
    console.log(`    ${i + 1}. ${item.task.term}`);
});

// 10. Show comprehensive metrics
console.log('\n[9] Strategy metrics:');
const status = strategy.getStatus();
console.log('  Config:', status.config);
console.log('  State:', {
    groundings: status.groundingsCount,
    atoms: status.atomsCount
});
console.log('  Metrics:', status.metrics);

console.log('\n' + '='.repeat(50));
console.log('✓ OpenAI integration complete');
console.log('\nProduction tips:');
console.log('  - Use GPT-4 for better reasoning quality');
console.log('  - Configure rate limiting for API calls');
console.log('  - Cache embeddings to reduce costs');
console.log('  - Monitor EventBus for debugging');
