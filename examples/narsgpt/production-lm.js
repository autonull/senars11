/**
 * Production NARS-GPT Example with Ollama
 * Demonstrates real-world integration with Ollama LLM for question-answering.
 */

import {NAR, NarsGPTStrategy, createNarsGPTBeliefRule, createNarsGPTQARule, EmbeddingLayer, LangChainProvider, EventBus} from '@senars/nar';

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL_NAME = process.env.OLLAMA_MODEL || 'llama2';

console.log('Production NARS-GPT with Ollama\n' + '='.repeat(50));

// 1. Initialize components
const nar = new NAR();
const eventBus = new EventBus();

// 2. Setup LM provider
console.log(`[1] Connecting to Ollama at ${OLLAMA_URL}...`);
const lm = new LangChainProvider({
    provider: 'ollama',
    modelName: MODEL_NAME,
    baseURL: OLLAMA_URL,
    temperature: 0.3,
    maxTokens: 300
});

// 3. Setup embedding layer (using mock for now, replace with real embeddings)
console.log('[2] Initializing embedding layer...');
const embeddingLayer = new EmbeddingLayer({
    model: 'mock' // TODO: Replace with Ollama embeddings
});

// 4. Create NARS-GPT strategy
console.log('[3] Creating NARS-GPT strategy...');
const strategy = new NarsGPTStrategy({
    embeddingLayer,
    eventBus,
    relevantViewSize: 20,
    recentViewSize: 10,
    perspectiveMode: 'neutralize', // Use 3rd-person for knowledge representation
    weights: {relevance: 0.7, recency: 0.3}
});

// 5. Enable EventBus logging for observability
console.log('[4] Enabling EventBus logging...');
eventBus.on('narsgpt:candidates', ({query, bufferSize}) => {
    console.log(`  [Event] Attention buffer built: ${bufferSize} items for "${query}"`);
});

eventBus.on('narsgpt:atomCreated', ({term, type}) => {
    console.log(`  [Event] New atom created: "${term}" (${type})`);
});

eventBus.on('narsgpt:atomUnified', ({term, unifiedTo, similarity}) => {
    console.log(`  [Event] Atom unified: "${term}" → "${unifiedTo}" (similarity: ${similarity.toFixed(3)})`);
});

eventBus.on('narsgpt:grounded', ({narsese, sentence}) => {
    console.log(`  [Event] Grounded: "${sentence}" → ${narsese}`);
});

// 6. Create LM rules
console.log('[5] Creating NARS-GPT rules...');
const qaRule = createNarsGPTQARule({
    lm,
    narsGPTStrategy: strategy,
    parser: nar.parser,
    eventBus,
    memory: nar.mem
});

const beliefRule = createNarsGPTBeliefRule({
    lm,
    narsGPTStrategy: strategy,
    parser: nar.parser,
    eventBus,
    memory: nar.mem
});

// 7. Add knowledge to memory
console.log('\n[6] Adding domain knowledge...');
nar.input('(bird --> animal).');
nar.input('(robin --> bird).');
nar.input('(penguin --> bird).');
nar.input('(robin --> flyer). {0.9 0.9}');
nar.input('(penguin --> flyer). {0.1 0.8}'); // Penguins don't fly well

// 8. Ground knowledge for NARS-GPT
console.log('[7] Grounding knowledge...');
await strategy.ground('(bird --> animal)', 'Birds are animals');
await strategy.ground('(robin --> bird)', 'Robins are birds');
await strategy.ground('(penguin --> bird)', 'Penguins are birds');
console.log(`  Groundings registered: ${strategy.groundings.size}`);

// 9. Demonstrate question answering with real LM
console.log('\n[8] Question answering with Ollama...');
try {
    // This will use the real Ollama LLM via qaRule
    const buffer = await strategy.buildAttentionBuffer('Can penguins fly?', nar.mem, Date.now());
    console.log(`  Attention buffer: ${buffer.length} items retrieved`);

    buffer.slice(0, 3).forEach((item, i) => {
        console.log(`    ${i + 1}. ${item.task.term} (relevance: ${item.relevance?.toFixed(2) ?? 0})`);
    });

    console.log('\n  Note: To get LM response, process question through qaRule.condition()');
} catch (error) {
    console.error('  Error:', error.message);
    console.log('  Make sure Ollama is running: ollama serve');
}

// 10. Show metrics
console.log('\n[9] Strategy metrics:');
const metrics = strategy.metrics;
console.log(`  Attention buffers: ${metrics.attentionBufferBuilds}`);
console.log(`  Atomizations: ${metrics.atomizations}`);
console.log(`  Grounding checks: ${metrics.groundingChecks}`);
console.log(`  Perspective ops: ${metrics.perspectiveOps}`);

console.log('\n' + '='.repeat(50));
console.log('✓ Production example complete');
console.log('\nSetup:');
console.log('  1. Install Ollama: https://ollama.ai');
console.log('  2. Run: ollama pull llama2');
console.log('  3. Start: ollama serve');
console.log('  4. Run this example');
