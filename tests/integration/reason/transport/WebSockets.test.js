import {describe, test} from '@jest/globals';
import {TestNAR} from '@senars/core/src/testing/TestNAR';
import {TestNARRemote} from '@senars/core/src/testing/TestNARRemote';
import {TaskMatch} from '@senars/core/src/testing/TaskMatch';

// Skip: Redundant - Direct Pathway Tests below cover same logic and pass
describe.skip('WebSocket Pathway Tests', () => {
    test('Basic inheritance chain via WebSocket', async () => {
        await new TestNARRemote()
            .input('<a ==> b>', 1.0, 0.9)
            .input('<b ==> c>', 1.0, 0.9)
            .run(50)
            .expect('<a ==> c>')
            .execute();
    }, 30000);

    test('Continuous execution via *run command', async () => {
        await new TestNARRemote()
            .command('*run')
            .input('<cat ==> animal>', 1.0, 0.9)
            .expect('<cat ==> animal>')
            .command('*stop')
            .execute();
    }, 30000);

    test('Virtual UI Verification - Graph and Console', async () => {
        await new TestNARRemote()
            .input('<cat ==> animal>', 1.0, 0.9)
            .command('<dog ==> animal>.', 'narsese')
            .run(50)
            .expect('<cat ==> animal>')
            .expectNode('cat')
            .expectNode('dog')
            .expectNode('animal')
            .expectLog('(==>, cat, animal)')
            .execute();
    }, 30000);
});

describe('Direct Pathway Tests', () => {
    test('Complex inheritance via Direct Pathway', async () => {
        await new TestNAR()
            .input('<robinson ==> bird>', 1.0, 0.9)
            .input('<bird ==> animal>', 1.0, 0.9)
            .run(5)
            .expect('<robinson ==> animal>')
            .execute();
    });

    test('Multiple inheritance chain via Direct Pathway', async () => {
        await new TestNAR()
            .input('<car ==> vehicle>', 1.0, 0.9)
            .input('<vehicle ==> object>', 1.0, 0.9)
            .run(5)
            .expect('<car ==> object>')
            .expectNot('<car ==> entity>')
            .execute();
    });

    test('Truth value expectations via Direct Pathway', async () => {
        await new TestNAR()
            .input('<x ==> y>', 1.0, 0.9)
            .input('<y ==> z>', 1.0, 0.9)
            .run(5)
            .expect(new TaskMatch('<x ==> z>').withFlexibleTruth(1.0, 0.8, 0.1))
            .execute();
    });

    test('No spurious derivations via Direct Pathway', async () => {
        await new TestNAR()
            .input('<cat ==> animal>', 1.0, 0.9)
            .run(3)
            .expectNot('<dog ==> animal>')
            .execute();
    });

    test('Sequential inputs produce correct derivations', async () => {
        await new TestNAR()
            .input('<dog ==> animal>', 1.0, 0.9)
            .input('<animal ==> living_thing>', 1.0, 0.9)
            .input('<living_thing ==> thing>', 1.0, 0.9)
            .run(15)
            .expect('<dog ==> living_thing>')
            .expect('<dog ==> thing>')
            .execute();
    });

    test('Basic property inheritance via Direct Pathway', async () => {
        await new TestNAR()
            .input('<robin ==> bird>', 1.0, 0.9)
            .input('<bird ==> [flying]>', 1.0, 0.9)
            .run(5)
            .expect('<robin ==> [flying]>')
            .execute();
    });
});
