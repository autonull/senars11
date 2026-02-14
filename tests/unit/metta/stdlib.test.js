/**
 * Unit Tests for MeTTa Standard Library
 * Tests core.metta, list.metta, match.metta, and types.metta
 */

import { MeTTaTestUtils } from '../../helpers/MeTTaTestUtils.js';

describe('MeTTa Standard Library Tests', () => {
    let interpreter, termFactory;

    beforeEach(() => {
        termFactory = MeTTaTestUtils.createTermFactory();
        // Create interpreter with stdlib loading enabled (default)
        interpreter = MeTTaTestUtils.createInterpreter({ termFactory, loadStdlib: true });
    });

    describe('core.metta - Control Flow', () => {
        test('if with True condition returns then branch', () => {
            const result = interpreter.run('(if True 1 2)');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('1');
        });

        test('if with False condition returns else branch', () => {
            const result = interpreter.run('(if False 1 2)');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('2');
        });

        test('not negates boolean values', () => {
            const trueResult = interpreter.run('(not True)');
            expect(trueResult[0].name).toBe('False');

            const falseResult = interpreter.run('(not False)');
            expect(falseResult[0].name).toBe('True');
        });

        test('and performs logical conjunction', () => {
            expect(interpreter.run('(and True True)')[0].name).toBe('True');
            expect(interpreter.run('(and True False)')[0].name).toBe('False');
            expect(interpreter.run('(and False True)')[0].name).toBe('False');
            expect(interpreter.run('(and False False)')[0].name).toBe('False');
        });

        test('or performs logical disjunction', () => {
            expect(interpreter.run('(or True True)')[0].name).toBe('True');
            expect(interpreter.run('(or True False)')[0].name).toBe('True');
            expect(interpreter.run('(or False True)')[0].name).toBe('True');
            expect(interpreter.run('(or False False)')[0].name).toBe('False');
        });

        test('identity function returns value unchanged', () => {
            const result = interpreter.run('(id 42)');
            expect(result[0].name).toBe('42');
        });

        test('const returns first argument', () => {
            const result = interpreter.run('(const 5 10)');
            expect(result[0].name).toBe('5');
        });
    });

    describe('core.metta - Lambda Functions', () => {
        test('lambda application with single variable', () => {
            // (λ $x (* $x 2)) applied to 5 should give 10
            const result = interpreter.run('((λ $x (* $x 2)) 5)');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('10');
        });

        test('let binding evaluates body with bound variable', () => {
            const result = interpreter.run('(let $x 5 (* $x 2))');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('10');
        });

        test('compose combines two functions', () => {
            // Define two functions and compose them
            interpreter.load(`
                (= (double $x) (* $x 2))
                (= (add3 $x) (+ $x 3))
            `);
            const result = interpreter.run('(compose double add3 5)');
            // Should be double(add3(5)) = double(8) = 16
            expect(result[0].name).toBe('16');
        });
    });

    describe('list.metta - List Operations', () => {
        test('empty list is recognized', () => {
            const result = interpreter.run('(empty? ())');
            expect(result[0].name).toBe('True');
        });

        test('non-empty list is not empty', () => {
            const result = interpreter.run('(empty? (: 1 ()))');
            expect(result[0].name).toBe('False');
        });

        test('car returns head of list', () => {
            const result = interpreter.run('(car (: 1 (: 2 ())))');
            expect(result[0].name).toBe('1');
        });

        test('cdr returns tail of list', () => {
            const result = interpreter.run('(cdr (: 1 (: 2 ())))');
            // Should return (: 2 ())
            expect(result[0].operator.name).toBe(':');
        });

        test('length counts list elements', () => {
            const result = interpreter.run('(length (: 1 (: 2 (: 3 ()))))');
            expect(result[0].name).toBe('3');
        });

        test('append concatenates two lists', () => {
            const result = interpreter.run('(append (: 1 (: 2 ())) (: 3 (: 4 ())))');
            // Result should be a list with 4 elements
            expect(result).toHaveLength(1);
            const list = result[0];
            expect(list.operator.name).toBe(':');
        });
    });

    describe('list.metta - Higher-Order Functions', () => {
        test('map transforms each element', () => {
            // This is the Phase 2 success criterion!
            const result = interpreter.run('(map (λ $x (* $x 2)) (: 1 (: 2 ())))');
            expect(result).toHaveLength(1);

            // Result should be (: 2 (: 4 ()))
            const list = result[0];
            expect(list.operator.name).toBe(':');
            expect(list.components[0].name).toBe('2');

            const tail = list.components[1];
            expect(tail.operator.name).toBe(':');
            expect(tail.components[0].name).toBe('4');
        });

        test('filter selects matching elements', () => {
            // Define a predicate
            interpreter.load('(= (even? $x) (== (% $x 2) 0))');

            const result = interpreter.run('(filter even? (: 1 (: 2 (: 3 (: 4 ())))))');
            // Should return (: 2 (: 4 ()))
            expect(result).toHaveLength(1);
        });

        test('fold accumulates values from left', () => {
            const result = interpreter.run('(fold + 0 (: 1 (: 2 (: 3 ()))))');
            // 0 + 1 = 1, 1 + 2 = 3, 3 + 3 = 6
            expect(result[0].name).toBe('6');
        });

        test('reverse reverses list order', () => {
            const result = interpreter.run('(reverse (: 1 (: 2 (: 3 ()))))');
            // Should be (: 3 (: 2 (: 1 ())))
            const list = result[0];
            expect(list.components[0].name).toBe('3');
        });
    });

    describe('match.metta - Pattern Matching', () => {
        test('match finds matching atoms in space', () => {
            // Load some facts
            interpreter.load(`
                (= (human Socrates) True)
                (= (human Plato) True)
            `);

            // Match pattern to find humans
            const results = interpreter.query('(= (human $x) True)', '$x');
            expect(results.length).toBeGreaterThan(0);

            const names = results.map(t => t.name);
            expect(names).toContain('Socrates');
            expect(names).toContain('Plato');
        });

        test('exists? checks if pattern has matches', () => {
            interpreter.load('(= (fact) True)');

            const result = interpreter.run('(exists? &self (= (fact) True))');
            expect(result[0].name).toBe('True');
        });
    });

    describe('types.metta - Type System', () => {
        test('arithmetic operations have correct type signatures', () => {
            // Check that + has type (-> Number Number Number)
            const results = interpreter.query('(: + $t)', '$t');
            expect(results.length).toBeGreaterThan(0);

            // Type should be a function type
            const typeExpr = results[0];
            expect(typeExpr.operator.name).toBe('->');
        });

        test('is-bool? identifies boolean values', () => {
            expect(interpreter.run('(is-bool? True)')[0].name).toBe('True');
            expect(interpreter.run('(is-bool? False)')[0].name).toBe('True');
            expect(interpreter.run('(is-bool? 42)')[0].name).toBe('False');
        });

        test('typeof queries term type', () => {
            // Add a type annotation
            interpreter.load('(: myvar Number)');

            const result = interpreter.run('(typeof myvar)');
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].name).toBe('Number');
        });
    });

    describe('Integration Tests', () => {
        test('stdlib modules work together', () => {
            // Use map with if for conditional transformation
            interpreter.load(`
                (= (positive? $x) (> $x 0))
                (= (abs $x) (if (positive? $x) $x (- 0 $x)))
            `);

            const result = interpreter.run('(map abs (: -1 (: 2 (: -3 ()))))');
            // Should be (: 1 (: 2 (: 3 ())))
            expect(result).toHaveLength(1);
        });

        test('nested let bindings work correctly', () => {
            const result = interpreter.run('(let $x 5 (let $y 3 (+ $x $y)))');
            expect(result[0].name).toBe('8');
        });

        test('higher-order functions with lambdas', () => {
            // map with lambda that uses let
            const result = interpreter.run('(map (λ $x (let $y 2 (* $x $y))) (: 3 (: 4 ())))');
            // Should be (: 6 (: 8 ()))
            expect(result).toHaveLength(1);
        });
    });

    describe('Stdlib Loading', () => {
        test('stdlib is loaded by default', () => {
            // Check that stdlib rules are in the space
            const atomCount = interpreter.space.getAtomCount ? interpreter.space.getAtomCount() : interpreter.space.size();
            expect(atomCount).toBeGreaterThan(0);
        });

        test('stdlib can be disabled via config', () => {
            const noStdlibInterpreter = MeTTaTestUtils.createInterpreter({
                termFactory,
                loadStdlib: false
            });

            // Stdlib functions should not be available
            // This would throw or return empty since 'if' wouldn't be defined
            const result = noStdlibInterpreter.run('(if True 1 2)');
            // Without stdlib, this might not reduce
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('empty list operations', () => {
            expect(interpreter.run('(length ())')[0].name).toBe('0');
            expect(interpreter.run('(empty? ())')[0].name).toBe('True');
            expect(interpreter.run('(reverse ())')[0].name).toBe('()');
        });

        test('single element list operations', () => {
            expect(interpreter.run('(length (: 1 ()))')[0].name).toBe('1');
            expect(interpreter.run('(car (: 1 ()))')[0].name).toBe('1');
        });
    });
});
