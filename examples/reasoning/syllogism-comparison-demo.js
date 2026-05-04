/**
 * Syllogistic Reasoning Comparison: Traditional vs Stream-Based Reasoner
 * Demonstrates classic syllogistic reasoning: All men are mortal. Socrates is a man. Therefore, Socrates is mortal.
 * Compares both traditional cycle-based and new stream-based reasoning approaches.
 */

import {NAR} from '@senars/nar';

async function traditionalSyllogismDemo() {
    console.log('=== Traditional NAL-only Syllogistic Reasoning Demo ===\n');

    // Initialize NAR with traditional cycle-based reasoner (default)
    const config = {
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: false  // Use traditional cycle-based reasoner
        }
    };

    const nar = new NAR(config);
    await nar.initialize();

    console.log('Input: All men are mortal');
    await nar.input('<man --> mortal>. %1.0;0.9%');

    console.log('Input: Socrates is a man');
    await nar.input('<Socrates --> man>. %1.0;0.8%');

    console.log('\nRunning reasoning cycles...\n');
    await nar.runCycles(10);

    // Check for derived belief that Socrates is mortal
    const beliefs = nar.getBeliefs();
    console.log('Beliefs after reasoning:');
    beliefs.forEach((task, index) => {
        console.log(`${index + 1}. ${task.term.name} ${task.truth ? task.truth.toString() : ''} [Priority: ${task.budget?.priority?.toFixed(2) || 'N/A'}]`);
    });

    console.log(`\nTotal reasoning cycles completed: ${nar.cycleCount}`);
    console.log(`Total concepts in memory: ${nar.memory.getAllConcepts().length}`);

    return nar;
}

async function streamSyllogismDemo() {
    console.log('\n' + '='.repeat(70));
    console.log('=== Stream-Based Syllogistic Reasoning Demo ===\n');

    // Initialize NAR with new stream-based reasoner
    const config = {
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: true,  // Enable new stream-based reasoner
            maxDerivationDepth: 5,
            cpuThrottleInterval: 0  // No throttle for demo
        }
    };

    const nar = new NAR(config);
    await nar.initialize();

    console.log('Input: All men are mortal');
    await nar.input('<man --> mortal>. %1.0;0.9%');

    console.log('Input: Socrates is a man');
    await nar.input('<Socrates --> man>. %1.0;0.8%');

    console.log('\nStarting stream reasoning...\n');

    // Start the stream reasoner
    nar.start();

    // Wait for a few seconds to allow derivations to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Stop the stream reasoner
    nar.stop();

    // Check for derived beliefs
    const beliefs = nar.getBeliefs();
    console.log('Beliefs after stream reasoning:');
    beliefs.forEach((task, index) => {
        console.log(`${index + 1}. ${task.term.name} ${task.truth ? task.truth.toString() : ''} [Priority: ${task.budget?.priority?.toFixed(2) || 'N/A'}]`);
    });

    // Get specific stats for stream reasoner
    const stats = nar.getStats();
    console.log(`\nStream reasoner derivations: ${stats.cycleCount}`);
    console.log(`Total concepts in memory: ${stats.memoryStats.conceptCount}`);

    if (stats.streamReasonerStats) {
        console.log(`Stream reasoner metrics:`);
        console.log(`  Total derivations: ${stats.streamReasonerStats.totalDerivations}`);
        console.log(`  Processing time: ${stats.streamReasonerStats.totalProcessingTime}ms`);
        console.log(`  Throughput: ${(stats.streamReasonerStats.throughput || 0).toFixed(2)}/sec`);
    }

    return nar;
}

async function runComparison() {
    console.log('🚀 Syllogistic Reasoning: Traditional vs Stream-Based Comparison\n');

    // Run traditional demo
    console.log('🔍 Traditional Approach:');
    await traditionalSyllogismDemo();

    console.log('\n' + '='.repeat(70));

    // Run stream demo
    console.log('🔍 Stream-Based Approach:');
    await streamSyllogismDemo();

    console.log('\n🎯 Comparison completed! Both approaches should derive similar conclusions.');
}

// Run the comparison
if (import.meta.url === `file://${process.argv[1]}`) {
    runComparison().catch(console.error);
}

export {traditionalSyllogismDemo, streamSyllogismDemo, runComparison};