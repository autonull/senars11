/**
 * NAL-only Reasoning Demonstration: Syllogisms
 * Demonstrates classic syllogistic reasoning: All men are mortal. Socrates is a man. Therefore, Socrates is mortal.
 * Updated to show both traditional and new stream-based reasoner approaches.
 */

import {NAR} from '@senars/nar';

async function syllogismDemo() {
    console.log('=== NAL-only Syllogistic Reasoning Demo ===\n');

    console.log('🧪 Testing with Traditional Cycle-Based Reasoner:');
    // Initialize NAR with traditional cycle-based reasoner (default)
    const traditionalConfig = {
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: false  // Use traditional cycle-based reasoner
        }
    };

    const traditionalNar = new NAR(traditionalConfig);
    await traditionalNar.initialize();

    console.log('Input: All men are mortal');
    await traditionalNar.input('(man --> mortal). %1.0;0.9%');

    console.log('Input: Socrates is a man');
    await traditionalNar.input('(Socrates --> man). %1.0;0.8%');

    console.log('\nRunning reasoning cycles...\n');
    await traditionalNar.runCycles(10);

    // Check for derived belief that Socrates is mortal
    const traditionalBeliefs = traditionalNar.getBeliefs();
    console.log('Beliefs after traditional reasoning:');
    traditionalBeliefs.forEach((task, index) => {
        console.log(`${index + 1}. ${task.term.name} ${task.truth ? task.truth.toString() : ''} [Priority: ${task.budget?.priority?.toFixed(2) || 'N/A'}]`);
    });

    console.log(`\nTotal reasoning cycles completed: ${traditionalNar.cycleCount}`);
    console.log(`Total concepts in memory: ${traditionalNar.memory.getAllConcepts().length}`);

    console.log('\n' + '='.repeat(70));
    console.log('\n🧪 Testing with New Stream-Based Reasoner:');

    // Initialize NAR with new stream-based reasoner
    const streamConfig = {
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: true,  // Enable new stream-based reasoner
            maxDerivationDepth: 5,
            cpuThrottleInterval: 0  // No throttle for demo
        }
    };

    const streamNar = new NAR(streamConfig);
    await streamNar.initialize();

    console.log('Input: All men are mortal');
    await streamNar.input('(man --> mortal). %1.0;0.9%');

    console.log('Input: Socrates is a man');
    await streamNar.input('(Socrates --> man). %1.0;0.8%');

    console.log('\nStarting stream reasoning...\n');

    // Start the stream reasoner
    streamNar.start();

    // Run a few manual steps to ensure reasoning occurs
    for (let i = 0; i < 20; i++) {
        await streamNar.step();
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to allow processing
    }

    // Wait briefly for any async derivations
    await new Promise(resolve => setTimeout(resolve, 100));

    // Stop the stream reasoner
    streamNar.stop();

    // Check for derived beliefs
    const streamBeliefs = streamNar.getBeliefs();
    console.log('Beliefs after stream reasoning:');
    streamBeliefs.forEach((task, index) => {
        console.log(`${index + 1}. ${task.term.name} ${task.truth ? task.truth.toString() : ''} [Priority: ${task.budget?.priority?.toFixed(2) || 'N/A'}]`);
    });

    // Get specific stats for stream reasoner
    const stats = streamNar.getStats();
    console.log(`\nStream reasoner derivations: ${stats.cycleCount}`);
    console.log(`Total concepts in memory: ${stats.memoryStats.conceptCount}`);

    if (stats.streamReasonerStats) {
        console.log(`Stream reasoner metrics:`);
        console.log(`  Total derivations: ${stats.streamReasonerStats.totalDerivations}`);
        console.log(`  Processing time: ${stats.streamReasonerStats.totalProcessingTime}ms`);
        console.log(`  Throughput: ${(stats.streamReasonerStats.throughput || 0).toFixed(2)}/sec`);
    }

    console.log('\n🎯 Demonstrations completed! Both reasoner types should derive similar conclusions.');
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
    syllogismDemo().then(() => process.exit(0)).catch(e => {
        console.error(e);
        process.exit(1);
    });
}

export default syllogismDemo;

