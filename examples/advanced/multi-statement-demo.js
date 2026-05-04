import {NAR} from '@senars/nar';

// Test to see what happens with two statements
async function testTwoStatements() {
    console.log('🔍 Testing two statements...');

    const nar = new NAR();
    await nar.initialize();

    console.log('\\nInputting (a-->b). %1.0;0.9%');
    await nar.input('(a-->b). %1.0;0.9%');

    console.log('\\nAfter first input:');
    const beliefs1 = nar.getBeliefs();
    console.log(`Beliefs: ${beliefs1.length}`);
    beliefs1.forEach((task, i) => {
        const term = task.term?.toString?.() || task.term || 'Unknown';
        const truth = task.truth ? `${task.truth.frequency},${task.truth.confidence}` : 'NULL';
        console.log(`  ${i + 1}. ${term} [${truth}]`);
    });

    console.log('\\nInputting (b-->c). %1.0;0.9%');
    await nar.input('(b-->c). %1.0;0.9%');

    console.log('\\nAfter second input:');
    const beliefs2 = nar.getBeliefs();
    console.log(`Beliefs: ${beliefs2.length}`);
    beliefs2.forEach((task, i) => {
        const term = task.term?.toString?.() || task.term || 'Unknown';
        const truth = task.truth ? `${task.truth.frequency},${task.truth.confidence}` : 'NULL';
        console.log(`  ${i + 1}. ${term} [${truth}]`);
    });

    console.log('\\nRunning 1 reasoning cycle...');
    await nar.step();

    console.log('\\nAfter 1 step:');
    const beliefs3 = nar.getBeliefs();
    console.log(`Beliefs: ${beliefs3.length}`);
    beliefs3.forEach((task, i) => {
        const term = task.term?.toString?.() || task.term || 'Unknown';
        const truth = task.truth ? `${task.truth.frequency},${task.truth.confidence}` : 'NULL';
        console.log(`  ${i + 1}. ${term} [${truth}]`);
    });

    console.log('\\nRunning 10 more reasoning cycles...');
    for (let i = 0; i < 10; i++) {
        await nar.step();
    }

    console.log('\\nAfter 11 total steps:');
    const beliefs4 = nar.getBeliefs();
    console.log(`Beliefs: ${beliefs4.length}`);
    beliefs4.forEach((task, i) => {
        const term = task.term?.toString?.() || task.term || 'Unknown';
        const truth = task.truth ? `${task.truth.frequency},${task.truth.confidence}` : 'NULL';
        console.log(`  ${i + 1}. ${term} [${truth}]`);
    });

    // Also check ALL tasks, not just beliefs
    console.log('\\nAll tasks in memory:');
    const stats = nar.getStats();
    console.log('Total tasks in memory stats:', stats.memoryStats?.memoryUsage?.totalTasks || stats.memoryStats?.totalTasks || 0);
}

testTwoStatements();