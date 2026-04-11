import {NAR} from '@senars/nar';

const nar = new NAR({
    nar: { lm: { enabled: true } },
    lm: { 
        provider: 'transformers', 
        modelName: 'Xenova/t5-small', 
        enabled: true 
    }
});

await new Promise(resolve => setTimeout(resolve, 2000));

console.log('=== NAL and LM Interaction Trace ===\n');

// Input facts that should trigger syllogistic reasoning
console.log('INPUT: (cat --> mammal).');
await nar.input('(cat --> mammal).');

console.log('INPUT: (mammal --> warm_blooded).');
await nar.input('(mammal --> warm_blooded).');

// Run cycles to allow reasoning
for (let i = 0; i < 30; i++) {
    await nar.step();
}

// Check beliefs
const beliefs = nar.getBeliefs();
console.log(`\nBELIEFS (${beliefs.length}):`);
for (const task of beliefs) {
    console.log(`  ${task.term.toString()} ${task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : ''}`);
}

// Try asking a question to trigger more reasoning
console.log('\nINPUT: (cat --> ?what)?');
await nar.input('(cat --> ?what)?');

for (let i = 0; i < 20; i++) {
    await nar.step();
}

console.log(`\nBELIEFS AFTER QUESTION (${nar.getBeliefs().length}):`);
for (const task of nar.getBeliefs()) {
    console.log(`  ${task.term.toString()} ${task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : ''}`);
}

// Try conditional reasoning
console.log('\nINPUT: (rain ==> wet).');
await nar.input('(rain ==> wet).');

console.log('INPUT: (rain).');
await nar.input('(rain).');

for (let i = 0; i < 20; i++) {
    await nar.step();
}

console.log(`\nBELIEFS AFTER CONDITIONAL (${nar.getBeliefs().length}):`);
for (const task of nar.getBeliefs()) {
    console.log(`  ${task.term.toString()} ${task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : ''}`);
}

// Check if we have any goals
console.log('\nINPUT: (goal --> desirable)!');
await nar.input('(goal --> desirable)!');

for (let i = 0; i < 10; i++) {
    await nar.step();
}

console.log(`\nFINAL BELIEFS (${nar.getBeliefs().length}):`);
for (const task of nar.getBeliefs()) {
    console.log(`  ${task.term.toString()} ${task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : ''} ${task.punctuation}`);
}

console.log('\n=== INTERESTING OBSERVATIONS ===');
console.log('• NAL Processing: Formal logic with truth values');
console.log('• Truth Maintenance: Frequency and confidence tracking');
console.log('• Goal Processing: Goal-driven reasoning with ! punctuation');
console.log('• LM Integration: Ready for hybrid processing with Xenova/t5-small');