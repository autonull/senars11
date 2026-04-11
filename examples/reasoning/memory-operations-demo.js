#!/usr/bin/env node
import {NAR} from '@senars/nar';

const section = (title) => console.log(`\n${'═'.repeat(60)}\n${title}\n${'═'.repeat(60)}`);
const log = (...args) => console.log('  ', ...args);

async function demonstrateMemoryOperations() {
    section('Memory Operations Demo');
    log('Demonstrating Memory API: concepts, beliefs, indexing, queries\n');

    const nar = new NAR({lm: {enabled: false}});
    await nar.initialize();
    const memory = nar.memory;

    // 1. Adding beliefs and creating concepts
    section('1️⃣  Adding Beliefs & Creating Concepts');
    await nar.input('<cat --> animal>. %0.9;0.9%');
    await nar.input('<dog --> animal>. %0.9;0.8%');
    await nar.input('<bird --> animal>. %0.8;0.85%');
    await nar.input('<robin --> bird>. %0.95;0.9%');

    const stats = memory.getStats();
    log(`Concepts created: ${stats.conceptCount}`);
    log(`Total beliefs: ${nar.getBeliefs().length}`);

    // 2. Querying concepts
    section('2️⃣  Querying Concepts');

    const animalConcept = memory.getConcept(nar.terms.createAtom('animal'));
    if (animalConcept) {
        log(`Concept 'animal' exists`);
        log(`  Priority: ${animalConcept.priority?.toFixed(3)}`);
        log(`  Incoming links: ${animalConcept.incomingLinks?.length || 0}`);
        log(`  Outgoing links: ${animalConcept.outgoingLinks?.length || 0}`);
    }

    // 3. Getting all concepts
    section('3️⃣  Enumerating All Concepts');
    const allConcepts = memory.getAllConcepts();
    log(`Total concepts: ${allConcepts.length}`);
    allConcepts.slice(0, 5).forEach((concept, i) => {
        log(`  ${i + 1}. ${concept.term.toString()} (priority: ${concept.priority?.toFixed(3) || 'N/A'})`);
    });

    // 4. Belief retrieval for a concept
    section('4️⃣  Retrieving Beliefs for a Concept');
    const birdConcept = memory.getConcept(nar.terms.createAtom('bird'));
    if (birdConcept) {
        const beliefs = birdConcept.beliefs || [];
        log(`'bird' concept has ${beliefs.length} beliefs:`);
        beliefs.forEach((belief, i) => {
            const term = belief.term?.toString() || 'Unknown';
            const truth = belief.truth?.toString() || 'Unknown';
            log(`  ${i + 1}. ${term} ${truth}`);
        });
    }

    // 5. Memory indexing and search
    section('5️⃣  Memory Indexing & Search');

    // Get concepts by term type
    const concepts = memory.getAllConcepts();
    const atomicConcepts = concepts.filter(c => c.term.type === 'Atom');
    const compoundConcepts = concepts.filter(c => c.term.type === 'Inheritance');

    log(`Atomic concepts: ${atomicConcepts.length}`);
    log(`Inheritance concepts: ${compoundConcepts.length}`);

    // 6. Belief management
    section('6️⃣  Direct Belief Management');

    const beliefs = nar.getBeliefs();
    log(`Total system beliefs: ${beliefs.length}`);

    // Filter by confidence
    const highConfidence = beliefs.filter(b => b.truth && b.truth.confidence > 0.85);
    log(`High confidence beliefs (>0.85): ${highConfidence.length}`);
    highConfidence.slice(0, 3).forEach((b, i) => {
        log(`  ${i + 1}. ${b.term.toString()} ${b.truth.toString()}`);
    });

    // 7. Memory capacity and forgetting
    section('7️⃣  Memory Capacity & Forgetting');

    log(`Current memory stats:`);
    const memStats = memory.getStats();
    Object.entries(memStats).forEach(([key, value]) => {
        if (typeof value === 'number') {
            log(`  ${key}: ${value}`);
        }
    });

    // Add many concepts to trigger potential forgetting
    for (let i = 0; i < 100; i++) {
        await nar.input(`<item${i} --> thing>. %0.5;0.5%`);
    }

    const newStats = memory.getStats();
    log(`\nAfter adding 100 items:`);
    log(`  Concepts: ${newStats.conceptCount} (was ${stats.conceptCount})`);

    // 8. Concept priority-based retrieval
    section('8️⃣  Priority-Based Retrieval');

    const allConceptsWithPriority = memory.getAllConcepts()
        .filter(c => c.priority != null)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    log('Top 5 concepts by priority:');
    allConceptsWithPriority.slice(0, 5).forEach((c, i) => {
        log(`  ${i + 1}. ${c.term.toString()} (priority: ${c.priority?.toFixed(3)})`);
    });

    // Cleanup
    await nar.dispose();

    section('✨ Key Takeaways');
    log('• memory.getConcept(term) - Retrieve specific concept');
    log('• memory.getAllConcepts() - Get all concepts in memory');
    log('• concept.beliefs - Access beliefs for a concept');
    log('• nar.getBeliefs() - Get all system beliefs');
    log('• Filter by truth values, term types, priority');
    log('• Memory automatically manages capacity via forgetting\n');
}

demonstrateMemoryOperations().catch(console.error);
