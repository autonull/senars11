/**
 * Domain Knowledge Grounding Examples
 * Demonstrates how to ground domain-specific knowledge for NARS-GPT.
 */

import {NarsGPTStrategy, EmbeddingLayer, NAR} from '@senars/nar';

console.log('Domain Knowledge Grounding Examples\n' + '='.repeat(50));

const strategy = new NarsGPTStrategy({
    embeddingLayer: new EmbeddingLayer({model: 'mock'}),
    perspectiveMode: 'neutralize'
});

const nar = new NAR();

// Helper to add and ground knowledge
const addKnowledge = async (narsese, sentence, description) => {
    nar.input(narsese);
    await strategy.ground(narsese.replace('.', ''), sentence);
    console.log(`  ✓ ${description}`);
    console.log(`    Narsese: ${narsese}`);
    console.log(`    Natural: "${sentence}"\n`);
};

// 1. Medical Domain
console.log('[1] Medical Domain');
await addKnowledge('(aspirin --> painkiller).', 'Aspirin relieves pain', 'Medication');
await addKnowledge('(fever --> symptom).', 'Fever is a symptom', 'Symptom');
await addKnowledge('(diagnosis --> process).', 'Diagnosis is a medical process', 'Process');
await addKnowledge('(treatment --> intervention).', 'Treatment is an intervention', 'Intervention');

// 2. Legal Domain
console.log('[2] Legal Domain');
await addKnowledge('(contract --> agreement).', 'A contract is a legal agreement', 'Agreement');
await addKnowledge('(statute --> law).', 'A statute is a law', 'Law');
await addKnowledge('(plaintiff --> party).', 'The plaintiff is a party to litigation', 'Party');
await addKnowledge('(evidence --> proof).', 'Evidence provides proof', 'Proof');

// 3. Technical Domain (Software)
console.log('[3] Software Engineering Domain');
await addKnowledge('(algorithm --> procedure).', 'An algorithm is a procedure', 'Procedure');
await addKnowledge('(debugging --> process).', 'Debugging is a process', 'Process');
await addKnowledge('(refactoring --> improvement).', 'Refactoring improves code', 'Improvement');
await addKnowledge('(testing --> validation).', 'Testing validates software', 'Validation');

// 4. Scientific Domain (Biology)
console.log('[4] Biology Domain');
await addKnowledge('(cell --> organism).', 'A cell is a basic unit of organisms', 'Organism');
await addKnowledge('(photosynthesis --> process).', 'Photosynthesis is a biological process', 'Process');
await addKnowledge('(evolution --> change).', 'Evolution is change over time', 'Change');
await addKnowledge('(ecosystem --> system).', 'An ecosystem is a biological system', 'System');

// 5. Business Domain
console.log('[5] Business Domain');
await addKnowledge('(revenue --> income).', 'Revenue is business income', 'Income');
await addKnowledge('(strategy --> plan).', 'Strategy is a business plan', 'Plan');
await addKnowledge('(market --> environment).', 'The market is a business environment', 'Environment');
await addKnowledge('(customer --> stakeholder).', 'Customers are stakeholders', 'Stakeholder');

// 6. Verify grounding
console.log('[6] Grounding Verification');
console.log(`  Total groundings: ${strategy.groundings.size}`);

const testCases = [
    'Aspirin relieves pain',
    'A contract is a legal agreement',
    'Debugging is a process',
    'Revenue is business income',
    'Unknown statement'
];

console.log('\n  Checking grounding matches:');
for (const test of testCases) {
    const result = await strategy.checkGrounding(test);
    console.log(`    "${test}"`);
    console.log(`    → Grounded: ${result.grounded}, Match: ${result.match || 'none'}, Similarity: ${result.similarity.toFixed(3)}\n`);
}

// 7. Domain-specific atomization
console.log('[7] Domain-Specific Term Atomization');
const medicalTerms = ['medication', 'medicine', 'drug', 'pharmaceutical'];
console.log('  Medical terms:');
for (const term of medicalTerms) {
    const result = await strategy.atomize(term, 'MEDICAL');
    console.log(`    "${term}" → ${result.isNew ? 'NEW' : `UNIFIED with "${result.unifiedTerm}"`}`);
}

const legalTerms = ['law', 'statute', 'regulation', 'rule'];
console.log('\n  Legal terms:');
for (const term of legalTerms) {
    const result = await strategy.atomize(term, 'LEGAL');
    console.log(`    "${term}" → ${result.isNew ? 'NEW' : `UNIFIED with "${result.unifiedTerm}"`}`);
}

console.log('\n' + '='.repeat(50));
console.log('✓ Domain knowledge grounding complete');
console.log('\nBest practices:');
console.log('  - Use consistent terminology within domains');
console.log('  - Ground both directions (term→concept, concept→term)');
console.log('  - Verify grounding with checkGrounding()');
console.log('  - Use type hints for atomization (MEDICAL, LEGAL, etc.)');
