/**
 * Stream Reasoner Components Demo
 * Demonstrates the individual components of the new stream-based reasoner working together:
 * - PremiseSource: TaskBagPremiseSource
 * - Strategy: Strategy
 * - RuleProcessor: StreamRuleProcessor
 * - RuleExecutor: StreamRuleExecutor
 */

import {NAR} from '@senars/nar';
import {
    RuleExecutor as StreamRuleExecutor,
    RuleProcessor as StreamRuleProcessor,
    Strategy,
    TaskBagPremiseSource
} from '@senars/nar';

async function componentsDemo() {
    console.log('🔄 Stream Reasoner Components Demo');
    console.log('Demonstrating how individual components work together\n');

    // Create a NAR instance to provide the memory system
    const narConfig = {
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: false  // We'll use the components directly
        }
    };

    const nar = new NAR(narConfig);
    await nar.initialize();

    console.log('✅ NAR initialized as memory provider');

    // Now create the stream reasoner components directly
    const memory = {
        taskBag: nar.taskManager,
        bag: nar.taskManager,
        getTaskBag: () => nar.taskManager
    };

    // 1. Create Premise Source
    const premiseSource = new TaskBagPremiseSource(memory, {
        priority: true,
        recency: false
    });
    console.log('✅ PremiseSource created with priority-based sampling');

    // 2. Create Strategy
    const strategy = new Strategy({
        maxSecondaryPremises: 10,  // Max 10 secondary premises to consider
        selectionStrategy: 'priority'  // Use priority-based selection
    });
    console.log('✅ Strategy created with priority-based secondary premise selection');

    // 3. Create Rule Executor (with built-in rule registration)
    const ruleExecutor = new StreamRuleExecutor({
        enableRuleOptimization: true,
        maxCachedRules: 100
    });
    console.log('✅ RuleExecutor created with optimization enabled');

    // 4. Create Rule Processor
    const ruleProcessor = new StreamRuleProcessor(ruleExecutor, {
        maxDerivationDepth: 5,
        asyncProcessingEnabled: true
    });
    console.log('✅ RuleProcessor created with async processing enabled');

    console.log('\n📝 Adding initial tasks to memory...');
    await nar.input('<cat --> animal>. %0.9;0.9%');
    await nar.input('<whiskers --> cat>. %0.9;0.8%');
    await nar.input('<dog --> animal>. %0.9;0.85%');
    await nar.input('<fido --> dog>. %0.9;0.8%');

    console.log('\n🔍 Demonstrating component interaction:');

    // Show available tasks in the premise source
    console.log('\n📋 Tasks available in TaskBag:');
    const allTasks = nar.taskManager.getTasks ? nar.taskManager.getTasks() : [];
    console.log(`   Total tasks: ${allTasks.length}`);
    allTasks.slice(0, 5).forEach((task, idx) => {
        console.log(`   ${idx + 1}. ${task.term.toString()} ${task.truth ? task.truth.toString() : ''}`);
    });

    console.log('\n🔄 Starting component interaction demo...');

    // Manually trigger a reasoning step by calling the components
    console.log('\n🔍 Step 1: Premise source providing primary premise...');
    const premiseIterator = premiseSource.stream();

    // Get a few premises to demonstrate
    const premises = [];
    let count = 0;
    for await (const premise of premiseIterator) {
        premises.push(premise);
        count++;
        if (count >= 3) break; // Get 3 premises for demo
    }

    console.log(`   Retrieved ${premises.length} premises from source`);
    premises.forEach((premise, idx) => {
        console.log(`   Premise ${idx + 1}: ${premise.term.toString()} ${premise.truth ? premise.truth.toString() : ''}`);
    });

    console.log('\n🔍 Step 2: Strategy pairing premises...');
    // For demo purposes, we'll take the first premise and get potential secondary premises
    if (premises.length > 0) {
        const primary = premises[0];
        console.log(`   Primary premise: ${primary.term.toString()}`);

        // In a real scenario, the strategy would be called with premise pairs
        // but for this demo, we'll just show how it would work
        console.log(`   Strategy would pair with other available tasks...`);

        // Show what would be available for pairing
        const otherTasks = allTasks.filter(t => t.term.toString() !== primary.term.toString());
        console.log(`   Available for pairing: ${Math.min(otherTasks.length, 5)} other tasks`);
        otherTasks.slice(0, 5).forEach((task, idx) => {
            console.log(`     ${idx + 1}. ${task.term.toString()}`);
        });
    }

    console.log('\n🔍 Step 3: Rule processing (would match rules to premise pairs)...');
    console.log('   In a full pipeline, RuleExecutor would match rules to premise pairs');
    console.log('   and RuleProcessor would execute both sync and async rules.');
    console.log('   Results would flow to the output stream.');

    // Show the NAR stats to confirm tasks are in memory
    console.log('\n📊 NAR Memory Stats:');
    const stats = nar.getStats();
    console.log(`   Concepts: ${stats.memoryStats.conceptCount}`);
    console.log(`   Total tasks: ${stats.taskManagerStats?.totalTasks || 'N/A'}`);

    console.log('\n🎯 Components demo completed!');
    console.log('   - PremiseSource can sample from memory based on configured objectives');
    console.log('   - Strategy can pair premises according to configured strategy');
    console.log('   - RuleExecutor can index and optimize rules for fast matching');
    console.log('   - RuleProcessor can execute rules asynchronously');
    console.log('   - All components work together in the streaming pipeline');
}

// Also demonstrate using the full Reasoner class with these components
async function fullPipelineDemo() {
    console.log('\n' + '='.repeat(70));
    console.log('🏛️  Full Pipeline Demo Using New Reasoner Class');
    console.log('Demonstrating the complete stream-based reasoning pipeline\n');

    const config = {
        lm: {enabled: false},
        reasoning: {
            useStreamReasoner: true,
            maxDerivationDepth: 5,
            cpuThrottleInterval: 1
        }
    };

    const nar = new NAR(config);
    await nar.initialize();

    console.log('✅ Full pipeline NAR initialized');

    // Add some complex reasoning tasks
    console.log('\n📝 Adding complex reasoning tasks...');
    await nar.input('<(bird & flyer) --> special>. %0.8;0.85%');
    await nar.input('<canary --> bird>. %0.9;0.9%');
    await nar.input('<canary --> yellow>. %0.85;0.85%');
    await nar.input('<(canary & yellow) --> pretty>. %0.75;0.8%');

    // Start the full pipeline
    console.log('\n🔄 Starting full stream reasoning pipeline...');
    nar.start();

    // Let it run for a few seconds
    await new Promise(resolve => setTimeout(resolve, 3000));

    nar.stop();

    // Show results
    const beliefs = nar.getBeliefs();
    console.log(`\n💭 Generated ${beliefs.length} beliefs through full pipeline`);

    const stats = nar.getStats();
    if (stats.streamReasonerStats) {
        console.log(`📊 Pipeline metrics:`);
        console.log(`   Total derivations: ${stats.streamReasonerStats.totalDerivations}`);
        console.log(`   Processing time: ${stats.streamReasonerStats.totalProcessingTime}ms`);
        console.log(`   Throughput: ${(stats.streamReasonerStats.throughput || 0).toFixed(2)}/sec`);
    }

    console.log('\n🎯 Full pipeline demo completed!');
}

async function runCompleteDemo() {
    await componentsDemo();
    await fullPipelineDemo();
    console.log('\n🏆 All demos completed! Both component-level and full-pipeline approaches work.');
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
    runCompleteDemo().catch(console.error);
}

export {componentsDemo, fullPipelineDemo, runCompleteDemo};