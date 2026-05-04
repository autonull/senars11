import {NarseseParser, TermFactory} from '@senars/nar';

const termFactory = new TermFactory();
const parser = new NarseseParser(termFactory);

// Test different operator orderings to see where exactly it fails
const testCases = [
    // Test individual operators without spaces
    {input: '(a-->b).', op: '-->', desc: 'tight arrow'},
    {input: '(a<->b).', op: '<->', desc: 'tight similarity'},
    {input: '(a==>b).', op: '==>', desc: 'tight implication'},
    {input: '(a<=>b).', op: '<=>', desc: 'tight equivalence'},
    {input: '(a=b).', op: '=', desc: 'tight equality'},
    {input: '(a&&b).', op: '&&', desc: 'tight conjunction'},
    {input: '(a||b).', op: '||', desc: 'tight disjunction'},
];

for (const testCase of testCases) {
    try {
        const result = parser.parse(testCase.input);
        console.log(`✓ Parsed ${testCase.desc}: "${testCase.input}"`);
    } catch (error) {
        console.log(`✗ Failed ${testCase.desc}: "${testCase.input}" -> ${error.message}`);
    }
}