import {NAR, PrologStrategy} from '@senars/nar';
import {NARTool} from '@senars/core/src/tool/NARTool.js';

describe('NARTool Prolog Integration', () => {
    let nar;
    let narTool;

    beforeEach(async () => {
        const prologStrategy = new PrologStrategy();
        nar = new NAR({
            reasoning: {
                type: 'stream',
                strategies: [prologStrategy],
            },
        });
        await nar.initialize();
        narTool = new NARTool(nar);
    });

    test('should assert a Prolog fact and query it', async () => {
        const fact = 'father(john, peter).';
        const query = 'father(john, peter)?';

        const assertResult = await narTool.execute({action: 'assert_prolog', content: fact});
        expect(assertResult.success).toBe(true);

        const queryResult = await narTool.execute({action: 'query_prolog', content: query});
        expect(queryResult.success).toBe(true);
        expect(queryResult.result).toBeDefined();
        expect(queryResult.result.length).toBeGreaterThan(0);
    });

    test('should assert a Prolog rule and use it to answer a query', async () => {
        const fact = 'man(socrates).';
        const rule = 'mortal(X) :- man(X).';
        const query = 'mortal(socrates)?';

        await narTool.execute({action: 'assert_prolog', content: fact});
        await narTool.execute({action: 'assert_prolog', content: rule});

        const queryResult = await narTool.execute({action: 'query_prolog', content: query});
        expect(queryResult.success).toBe(true);
        expect(queryResult.result).toBeDefined();
        expect(queryResult.result.length).toBeGreaterThan(0);
    });

    test('should handle Prolog rules with multiple conditions', async () => {
        const facts = [
            'person(socrates).',
            'greek(socrates).',
        ];
        const rule = 'philosopher(X) :- person(X), greek(X).';
        const query = 'philosopher(socrates)?';

        for (const fact of facts) {
            await narTool.execute({action: 'assert_prolog', content: fact});
        }
        await narTool.execute({action: 'assert_prolog', content: rule});

        const queryResult = await narTool.execute({action: 'query_prolog', content: query});
        expect(queryResult.success).toBe(true);
        expect(queryResult.result).toBeDefined();
        expect(queryResult.result.length).toBeGreaterThan(0);
    });
});
