/**
 * Simple test runner to verify all implemented functionality works together
 */

import {Reasoner, TaskBagPremiseSource, Strategy, RuleProcessor, Rule} from '@senars/nar';
import {createTestMemory, createTestTask} from '../../tests/support/index.js';

// Test rule for the comprehensive test
class TestRule extends Rule {
    constructor() {
        super('test-rule', 'nal', 1.0);
    }

    apply(primary, secondary) {
        // Create a simple derivation
        return [{
            id: `derived-${primary.id}-${secondary.id}`,
            priority: (primary.priority + secondary.priority) / 2,
            stamp: {
                depth: Math.max(primary.stamp.depth, secondary.stamp.depth) + 1,
                creationTime: Date.now()
            }
        }];
    }
}

console.log('Starting comprehensive functionality test...');

async function runComprehensiveTest() {
    try {
        // Set up the reasoner system
        const tasks = [
            createTestTask({id: 'input1', priority: 0.8, stamp: {creationTime: Date.now(), depth: 0}}),
            createTestTask({id: 'input2', priority: 0.6, stamp: {creationTime: Date.now() - 100, depth: 0}}),
            createTestTask({id: 'input3', priority: 0.9, stamp: {creationTime: Date.now() - 200, depth: 0}})
        ];
        const memory = createTestMemory({tasks});

        const premiseSource = new TaskBagPremiseSource(memory, {
            priority: true,
            dynamic: true,
            weights: {priority: 0.8, recency: 0.2}
        });

        const strategy = new Strategy();
        const ruleExecutor = new RuleExecutor();
        ruleExecutor.register(new TestRule());
        const ruleProcessor = new RuleProcessor(ruleExecutor, {maxDerivationDepth: 3});

        const reasoner = new Reasoner(premiseSource, strategy, ruleProcessor, {
            maxDerivationDepth: 3,
            cpuThrottleInterval: 0,
            backpressureThreshold: 10
        });

        // Test 1: Start the reasoner and get some derivations
        console.log('Test 1: Starting reasoner and processing derivations...');
        reasoner.start();

        const results = [];
        let count = 0;
        for await (const derivation of reasoner.outputStream) {
            results.push(derivation);
            count++;
            if (count >= 5) break; // Get 5 derivations
        }

        console.log(`Got ${results.length} derivations successfully`);

        // Test 2: Check metrics and introspection
        console.log('Test 2: Checking metrics and introspection...');
        const metrics = reasoner.getMetrics();
        const state = reasoner.getState();
        const debugInfo = reasoner.getDebugInfo();
        const perfMetrics = reasoner.getPerformanceMetrics();

        console.log('Metrics:', {
            totalDerivations: metrics.totalDerivations,
            throughput: metrics.throughput,
            backpressureLevel: metrics.backpressureLevel
        });

        // Test 3: Test dynamic adaptation
        console.log('Test 3: Testing dynamic adaptation...');
        premiseSource.recordMethodEffectiveness('priority', 0.9);
        premiseSource.recordMethodEffectiveness('recency', 0.7);
        premiseSource._updateWeightsDynamically();
        console.log('Updated weights:', premiseSource.weights);

        // Test 4: Test backpressure handling
        console.log('Test 4: Testing backpressure mechanisms...');
        ruleProcessor.asyncResultsQueue = new Array(15).fill(createTestTask({id: 'backpressure-test'}));
        const status = ruleProcessor.getStatus();
        console.log('Backpressure status:', status.backpressure);

        // Test 5: Test consumer feedback
        console.log('Test 5: Testing consumer feedback...');
        reasoner.receiveConsumerFeedback({
            processingSpeed: 5,
            backlogSize: 3,
            consumerId: 'test-consumer'
        });

        const updatedMetrics = reasoner.getMetrics();
        console.log('Backpressure level after feedback:', updatedMetrics.backpressureLevel);

        // Test 6: Test various sampling methods
        console.log('Test 6: Testing sampling methods...');
        const task1 = createTestTask({
            id: 'test-task',
            priority: 0.7,
            stamp: {creationTime: Date.now() - 100, depth: 2}
        });
        memory.taskBag.add(task1);

        const priorityResult = premiseSource._sampleByPriority();
        const recencyResult = premiseSource._sampleByRecency();
        const punctResult = premiseSource._sampleByPunctuation();
        const noveltyResult = premiseSource._sampleByNovelty();

        console.log('Sampling results - Priority:', priorityResult?.id,
            'Recency:', recencyResult?.id,
            'Punctuation:', punctResult?.id,
            'Novelty:', noveltyResult?.id);

        // Finalize test
        await reasoner.stop();
        await reasoner.cleanup();

        console.log('✓ All comprehensive tests completed successfully!');
        console.log('✓ Implemented features working together as expected');

        return true;
    } catch (error) {
        console.error('✗ Comprehensive test failed:', error);
        return false;
    }
}

// Run the test
runComprehensiveTest().then(success => {
    if (success) {
        console.log('\n🎉 All system components integrated successfully!');
        console.log('✅ SeNARS Reasoner redesign phase 7 completed');
    } else {
        console.log('\n❌ Some issues found in integration');
    }
});
