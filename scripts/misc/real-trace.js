import {NAR} from '@senars/nar';

const nar = new NAR({
    nar: { lm: { enabled: true } },
    lm: { 
        provider: 'transformers', 
        modelName: 'Xenova/t5-small', 
        enabled: true 
    }
});

// Wait for initialization
await new Promise(resolve => setTimeout(resolve, 2000));

// Set up event listeners to see what's actually happening
const events = [];
nar.on('derivation', task => {
    console.log('DERIVED:', task.term.toString(), task.punctuation, task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : '');
    events.push({type: 'derivation', task: task.term.toString(), punct: task.punctuation});
});

nar.on('output', task => {
    console.log('OUTPUT:', task.term.toString(), task.punctuation, task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : '');
    events.push({type: 'output', task: task.term.toString(), punct: task.punctuation});
});

// Input some related facts to trigger syllogistic reasoning
console.log('INPUT: (bird --> animal).');
await nar.input('(bird --> animal).');

console.log('INPUT: (robin --> bird).');
await nar.input('(robin --> bird).');

// Run several steps to allow derivations
for (let i = 0; i < 10; i++) {
    await nar.step();
}

// Now ask a question to trigger more processing
console.log('INPUT: (robin --> ?what)?');
await nar.input('(robin --> ?what)?');

for (let i = 0; i < 10; i++) {
    await nar.step();
}

console.log('\nEVENT SUMMARY:');
console.log('Total events captured:', events.length);
for (const event of events) {
    console.log(`  ${event.type}: ${event.task} ${event.punct}`);
}

console.log('\nFINAL BELIEFS:');
const beliefs = nar.getBeliefs();
for (const task of beliefs) {
    console.log(`  ${task.term.toString()} ${task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : ''}`);
}