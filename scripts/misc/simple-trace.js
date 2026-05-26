#!/usr/bin/env node

import {NAR} from '@senars/nar';

const nar = new NAR({
    lm: {
        provider: 'transformers',
        modelName: 'Xenova/t5-small',
        enabled: true
    }
});

await new Promise(resolve => setTimeout(resolve, 1000));

// Subscribe to see what actually happens
nar.on('output', task => {
    console.log('OUTPUT:', task.term.toString(), task.punctuation, task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : '');
});

nar.on('derivation', task => {
    console.log('DERIVATION:', task.term.toString(), task.punctuation, task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : '');
});

// Just throw some ideas at it
const inputs = [
    "(bird --> animal).",
    "(robin --> bird).", 
    "(robin --> ?what)?",
    "(cat --> mammal).",
    "(mammal --> warm_blooded).",
    "(dog <-> cat).",
    "(food ==> energy).",
    "(food).",
    "(goal --> desirable)!"
];

for (const input of inputs) {
    console.log('INPUT:', input);
    await nar.input(input);
    for (let i = 0; i < 3; i++) await nar.step();
}

// Let it run a bit more to see what emerges
for (let i = 0; i < 10; i++) {
    await nar.step();
}