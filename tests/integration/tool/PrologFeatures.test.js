import {NAR, PrologStrategy} from '@senars/nar';
import {NARTool} from '@senars/nar/src/tool/NARTool.js';

describe('Prolog Features Exploration', () => {
    let nar;
    let narTool;

    beforeEach(async () => {
        nar = new NAR({
            reasoning: {
                type: 'stream',
                maxDerivationDepth: 20
            },
            debug: {reasoning: false}
        });
        await nar.initialize();

        const prologStrategy = new PrologStrategy({termFactory: nar._termFactory});
        nar.streamReasoner.strategy.addStrategy(prologStrategy);
        narTool = new NARTool(nar);
    });

    test('should support Prolog lists (append)', async () => {
        const knowledge = [
            'append([], L, L).',
            'append([H|T], L2, [H|R]) :- append(T, L2, R).'
        ];

        for (const k of knowledge) {
            await narTool.execute({action: 'assert_prolog', content: k});
        }

        const query = 'append([1], [2], X)?';
        const answer = await narTool.execute({action: 'query_prolog', content: query});

        expect(answer.success).toBe(true);
        expect(answer.result.length).toBeGreaterThan(0);
        // Result is . structure: .(1, .(2, []))
        const termStr = answer.result[0].term.toString();
        expect(termStr).toContain('^, .');
    });

    test('should support basic Math (is)', async () => {
        const rule = 'addOne(X, Y) :- Y is X + 1.';
        await narTool.execute({action: 'assert_prolog', content: rule});

        const query = 'addOne(1, Y)?';
        const answer = await narTool.execute({action: 'query_prolog', content: query});

        expect(answer.success).toBe(true);
        expect(answer.result.length).toBeGreaterThan(0);

        // Check that Y bound to 2
        const term = answer.result[0].term;
        // Term is addOne(1, 2)
        // Components: [addOne, (1, 2)]
        // We can check string representation or structure
        expect(term.toString()).toContain('2');
    });
});
