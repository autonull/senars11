import {InputProcessor, NarseseParser, Task, TermFactory} from '@senars/nar';

describe('Negation Handling', () => {
    let termFactory;
    let inputProcessor;
    let parser;

    beforeEach(() => {
        termFactory = new TermFactory();
        parser = new NarseseParser(termFactory);
        inputProcessor = new InputProcessor({}, {parser, termFactory});
    });

    describe('TermFactory Reductions', () => {
        test('Double Negation Elimination: (--, (--, x)) -> x', () => {
            const x = termFactory.atomic('x');
            const negX = termFactory.negation(x);
            const doubleNegX = termFactory.negation(negX);

            expect(doubleNegX.toString()).toBe('x');
            expect(doubleNegX).toBe(x);
        });

        test('Implication Negation Reduction: (a ==> (--, b)) -> (--, (a ==> b))', () => {
            const a = termFactory.atomic('a');
            const b = termFactory.atomic('b');
            const negB = termFactory.negation(b);

            // Create (a ==> (--, b))
            const implication = termFactory.implication(a, negB);

            // Expect (--, (a ==> b))
            expect(implication.operator).toBe('--');
            expect(implication.components[0].operator).toBe('==>');
            expect(implication.components[0].components[0].toString()).toBe('a');
            expect(implication.components[0].components[1].toString()).toBe('b');
            expect(implication.toString()).toBe('(--, (==>, a, b))');
        });
    });

    describe('InputProcessor Negation Handling', () => {
        test('Input task with negation should be unwrapped and truth inverted', () => {
            // Input: (--, A). %1.0;0.9%
            // Expected Task: A. %0.0;0.9%

            const inputStr = '(--, A). %1.0;0.9%';
            const task = inputProcessor.processInput(inputStr);

            expect(task).toBeInstanceOf(Task);
            expect(task.term.toString()).toBe('A');
            expect(task.truth.f).toBeCloseTo(0.0); // 1.0 - 1.0
            expect(task.truth.c).toBeCloseTo(0.9);
        });

        test('Input task with negation (low freq) should be unwrapped and truth inverted', () => {
            // Input: (--, A). %0.1;0.9%
            // Expected Task: A. %0.9;0.9%

            const inputStr = '(--, A). %0.1;0.9%';
            const task = inputProcessor.processInput(inputStr);

            expect(task).toBeInstanceOf(Task);
            expect(task.term.toString()).toBe('A');
            expect(task.truth.f).toBeCloseTo(0.9); // 1.0 - 0.1
            expect(task.truth.c).toBeCloseTo(0.9);
        });

        test('Input task without negation should remain unchanged', () => {
            // Input: A. %1.0;0.9%
            // Expected Task: A. %1.0;0.9%

            const inputStr = 'A. %1.0;0.9%';
            const task = inputProcessor.processInput(inputStr);

            expect(task).toBeInstanceOf(Task);
            expect(task.term.toString()).toBe('A');
            expect(task.truth.f).toBeCloseTo(1.0);
            expect(task.truth.c).toBeCloseTo(0.9);
        });
    });
});
