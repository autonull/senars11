import {EvaluationEngine} from '../../../core/src/reason/EvaluationEngine.js';
import {TermFactory} from '../../../core/src/term/TermFactory.js';

describe('EvaluationEngine', () => {
    let engine;
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
        engine = new EvaluationEngine(null, termFactory);
    });

    test('should evaluate basic arithmetic operations', () => {
        const term = {
            operator: '+',
            components: [{value: 2}, {value: 3}]
        };
        // The original test assumed `evaluate` handles plain objects directly.
        // My refactor assumes `term` has `operator` and `components` structure.
        // However, `_op` logic uses `v.value` if present.
        const result = engine.evaluate(term);
        expect(result).toBe(5);
    });

    test('should solve simple assignment', async () => {
        const left = termFactory.variable('x');
        const right = termFactory.atomic('5');
        const result = await engine.solveEquation(left, right, '?x');

        expect(result.success).toBe(true);
        expect(result.result).toBe(right);
    });

    test('should solve linear equation (mocked)', async () => {
        const left = termFactory.create('+', [termFactory.variable('x'), termFactory.atomic('2')]);
        const right = termFactory.atomic('5');

        const result = await engine.solveEquation(left, right, '?x');
        expect(result.success).toBe(true);
        expect(result.result.type).toBe('symbolic_solution');
    });

    test('should perform comparisons', () => {
        // Accessing private methods is discouraged, but for testing purposes we can check public API or internals if exposed.
        // Or update test to use public `evaluate` or `processOperation`.

        // Using `evaluate` with comparison operators
        expect(engine.evaluate({ operator: '>', components: [{value: 5}, {value: 3}] })).toBe(true);
        expect(engine.evaluate({ operator: '<', components: [{value: 5}, {value: 3}] })).toBe(false);
    });
});
