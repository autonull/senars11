/**
 * NAL-only Reasoning Demonstration: Causal Reasoning
 * Demonstrates basic causal reasoning patterns in NAL with both traditional and new stream-based reasoners
 */

import {NAR} from '@senars/nar';

async function traditionalCausalDemo() {
    console.log('=== Traditional NAL-only Causal Reasoning Demo ===\n');

    // Initialize NAR with traditional cycle-based reasoner (default)
    const config = {
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: false  // Use traditional cycle-based reasoner
        }
    };

    const nar = new NAR(config);
    await nar.initialize();

    console.log('Input: If it rains, the ground gets wet');
    await nar.input('((&/, (rains =/> #1), (?1 --> [raining])) =/> (ground --> [wet])). %0.9;0.8%');

    console.log('Input: It is raining now');
    await nar.input('(rains =/> [raining]). %1.0;0.9%');

    console.log('\nRunning reasoning cycles...\n');
    await nar.runCycles(10);

    // Check for derived beliefs
    const beliefs = nar.getBeliefs();
    console.log('Beliefs after traditional reasoning:');
    beliefs.forEach((task, index) => {
        console.log(`${index + 1}. ${task.term.name} ${task.truth ? task.truth.toString() : ''} [Priority: ${task.budget?.priority?.toFixed(2) || 'N/A'}]`);
    });

    console.log(`\nTotal reasoning cycles completed: ${nar.cycleCount}`);
    console.log(`Total concepts in memory: ${nar.memory.getAllConcepts().length}`);

    return nar;
}

async function streamCausalDemo() {
    console.log('\n' + '='.repeat(70));
    console.log('=== Stream-Based Causal Reasoning Demo ===\n');

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

    console.log('Input: If it rains, the ground gets wet');
    await nar.input('((&/, (rains =/> #1), (?1 --> [raining])) =/> (ground --> [wet])). %0.9;0.8%');

    console.log('Input: It is raining now');
    await nar.input('(rains =/> [raining]). %1.0;0.9%');

    console.log('\nStarting stream reasoning...\n');

    // Start the stream reasoner
    nar.start();

    // Run a few manual steps to ensure reasoning occurs
    for (let i = 0; i < 20; i++) {
        await nar.step();
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to allow processing
    }

    // Wait a bit more for any async derivations
    await new Promise(resolve => setTimeout(resolve, 1000));

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

async function runCausalComparison() {
    console.log('🚀 Causal Reasoning: Traditional vs Stream-Based Comparison\n');

    // Run traditional demo
    await traditionalCausalDemo();

    // Run stream demo
    await streamCausalDemo();

    console.log('\n🎯 Causal reasoning comparison completed!');
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
    runCausalComparison().catch(console.error);
}

export {traditionalCausalDemo, streamCausalDemo, runCausalComparison};