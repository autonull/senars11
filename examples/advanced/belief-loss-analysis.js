import {NAR} from '@senars/nar';

// Test to see what happens to beliefs during reasoning
async function testBeliefDisappearance() {
    console.log('🔍 Testing what happens to beliefs during reasoning cycles...');

    const nar = new NAR();
    await nar.initialize();

    console.log('\\nInputting (a-->b). %1.0;0.9%');
    await nar.input('(a-->b). %1.0;0.9%');

    console.log('\\nAfter input:');
    const beliefs1 = nar.getBeliefs();
    console.log(`Beliefs: ${beliefs1.length}`);
    beliefs1.forEach((task, i) => {
        const term = task.term?.toString?.() || task.term || 'Unknown';
        const truth = task.truth ? `${task.truth.frequency},${task.truth.confidence}` : 'NULL';
        console.log(`  ${i + 1}. ${term} [${truth}]`);
    });

    console.log('\\nRunning 1 reasoning cycle...');
    await nar.step();

    console.log('\\nAfter 1 step:');
    const beliefs2 = nar.getBeliefs();
    console.log(`Beliefs: ${beliefs2.length}`);
    beliefs2.forEach((task, i) => {
        const term = task.term?.toString?.() || task.term || 'Unknown';
        const truth = task.truth ? `${task.truth.frequency},${task.truth.confidence}` : 'NULL';
        console.log(`  ${i + 1}. ${term} [${truth}]`);
    });

    console.log('\\nMemory stats after 1 step:');
    const stats = nar.getStats();
    console.log('Memory concepts:', stats.memoryStats?.memoryUsage?.concepts || stats.memoryStats?.totalConcepts || 0);
    console.log('Total tasks:', stats.memoryStats?.memoryUsage?.totalTasks || stats.memoryStats?.totalTasks || 0);
    console.log('Focus tasks:', stats.memoryStats?.memoryUsage?.focusConcepts || stats.memoryStats?.focusConceptsCount || 0);

    console.log('\\nRunning 2 more reasoning cycles...');
    await nar.step();
    await nar.step();

    console.log('\\nAfter 3 total steps:');
    const beliefs3 = nar.getBeliefs();
    console.log(`Beliefs: ${beliefs3.length}`);
    beliefs3.forEach((task, i) => {
        const term = task.term?.toString?.() || task.term || 'Unknown';
        const truth = task.truth ? `${task.truth.frequency},${task.truth.confidence}` : 'NULL';
        console.log(`  ${i + 1}. ${term} [${truth}]`);
    });
}

testBeliefDisappearance();