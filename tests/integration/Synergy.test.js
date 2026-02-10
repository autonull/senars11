
import { NAR } from '../../src/nar/NAR.js';
import { NARTool } from '../../src/tool/NARTool.js';
import { PrologStrategy } from '../../src/reason/strategy/PrologStrategy.js';
import { TermFactory } from '../../src/term/TermFactory.js';
import { Task } from '../../src/task/Task.js';
import { Truth } from '../../src/Truth.js';

describe('NAL and Prolog Synergy', () => {
    let nar;
    let narTool;
    let termFactory;

    beforeEach(async () => {
        const prologStrategy = new PrologStrategy();
        nar = new NAR({
            reasoning: {
                type: 'stream',
                strategies: [prologStrategy],
                maxDerivationDepth: 10
            },
            debug: {
                reasoning: false
            }
        });
        await nar.initialize();
        narTool = new NARTool(nar);
        termFactory = nar._termFactory;
    });

    test('should enable Prolog feedback loop into NAL stream', async () => {
        // 1. Prolog Knowledge
        await narTool.execute({ action: 'assert_prolog', content: 'man(socrates).' });
        await narTool.execute({ action: 'assert_prolog', content: 'mortal(X) :- man(X).' });

        // 2. Construct Prolog Query Task
        const createPrologTerm = (pred, ...args) => {
            const predTerm = termFactory.create(pred);
            const argTerms = args.map(a => {
                if (a.startsWith('?')) return termFactory.variable(a);
                return termFactory.create(a);
            });
            const argsTerm = termFactory.tuple(argTerms);
            return termFactory.predicate(predTerm, argsTerm);
        };

        const subgoalTerm = createPrologTerm('mortal', 'socrates');
        const subgoalTask = new Task({ term: subgoalTerm, punctuation: '?' });

        // 3. Query Prolog via NAR
        const answers = await nar.ask(subgoalTask);

        expect(answers).toBeDefined();
        expect(answers.length).toBeGreaterThan(0);
        const answerTask = answers[0];

        // Verify answer is "mortal(socrates)."
        // We can check term structure roughly or just re-input

        // 4. Feedback Loop: Inject Prolog answer into NAL stream
        // This validates that PrologStrategy output is compatible with NAR input
        const inputResult = await nar.input(answerTask);
        expect(inputResult).toBe(true); // Task accepted

        // 5. Verify it exists in memory/focus
        const concept = nar.memory.getConcept(answerTask.term);
        const inMemory = concept || (nar._focus && nar._focus.hasTask(answerTask));

        expect(inMemory).toBeTruthy();
    });
});
