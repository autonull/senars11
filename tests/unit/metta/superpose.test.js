
import { MeTTaInterpreter } from '../../../metta/src/MeTTaInterpreter.js';
import { Term } from '../../../metta/src/kernel/Term.js';
import { reduceND } from '../../../metta/src/kernel/Reduce.js';

describe('Superpose Non-Determinism', () => {
    let interpreter;

    beforeEach(() => {
        interpreter = new MeTTaInterpreter();
    });

    // Helper to get all results from run
    const run = (code) => {
        const results = interpreter.run(code);
        return results.map(r => r.toString());
    };

    const runND = (code) => {
        const commands = interpreter.parser.parseProgram(code);
        const results = [];

        for (const cmd of commands) {
            const reductions = reduceND(cmd, interpreter.space, interpreter.ground);
            results.push(...reductions.map(r => r.toString()));
        }
        return results.sort();
    };

    test('superpose expands to multiple results', () => {
        // (superpose (A B)) -> A, B
        const results = runND('(superpose (A B))');
        expect(results).toEqual(expect.arrayContaining(['A', 'B']));
        expect(results).toHaveLength(2);
    });

    test('nested superpose expands correctly', () => {
        // (+ 1 (superpose (1 2))) -> 2, 3
        const results = runND('(+ 1 (superpose (1 2)))');
        expect(results).toEqual(expect.arrayContaining(['2', '3']));
        expect(results).toHaveLength(2);
    });

    test('collapse collects results', () => {
        // (collapse (superpose (A B))) -> (A B)
        // using run() because collapse is registered in Interpreter and uses reduceND internally
        // Note: collapse returns a list atom.
        const results = run('!(collapse (superpose (A B)))');
        expect(results).toHaveLength(1);
        const listStr = results[0];
        // Expect (: A (: B ())) or similar list structure string representation
        expect(listStr).toContain('A');
        expect(listStr).toContain('B');
        expect(listStr.startsWith('(:')).toBe(true);
    });

    test('superpose with empty list returns nothing', () => {
        // (superpose ()) -> empty set (no results)
        const results = runND('(superpose ())');
        expect(results).toHaveLength(0);
    });

    test('non-deterministic rules', () => {
        // (= (color) red)
        // (= (color) green)
        // (color) -> red, green
        interpreter.run('(= (color) red)');
        interpreter.run('(= (color) green)');
        const results = runND('(color)');
        expect(results).toEqual(expect.arrayContaining(['red', 'green']));
        expect(results).toHaveLength(2);
    });
});
