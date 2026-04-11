/**
 * Lambda Diagnostic Tests
 * Minimal tests to isolate lambda evaluation issues
 */

import {MeTTaTestUtils} from '../../helpers/MeTTaTestUtils.js';

describe('Lambda Diagnostic Tests', () => {
    let interpreter;

    beforeEach(() => {
        interpreter = MeTTaTestUtils.createInterpreter({loadStdlib: true});
    });

    test('lambda basic identity - (λ $x $x) 5', () => {
        const result = interpreter.run('((λ $x $x) 5)');
        console.log('[DEBUG] Identity lambda result:', result[0]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('5');
    });

    test('lambda with grounded operation - (λ $x (* $x 2)) 5', () => {
        const result = interpreter.run('((λ $x (* $x 2)) 5)');
        console.log('[DEBUG] Arithmetic lambda result:', result[0]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('10');
    });

    test('&subst grounded operation directly', () => {
        // Test &subst directly to verify it works
        const result = interpreter.run('(^ &subst $x 5 (* $x 2))');
        console.log('[DEBUG] Direct &subst result:', result[0]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('10');
    });

    test('lambda rule is loaded in space', () => {
        // Check if lambda rule exists in space
        const query = interpreter.space.all();
        const lambdaRules = Array.from(query).filter(atom =>
            atom.toString().includes('λ') || atom.toString().includes('lambda')
        );
        console.log('[DEBUG] Lambda rules in space:', lambdaRules.map(r => r.toString()));
        expect(lambdaRules.length).toBeGreaterThan(0);
    });

    test('step-by-step lambda reduction', () => {
        // Test individual reduction steps
        const parser = interpreter.parser;
        const atom = parser.parse('((λ $x (* $x 2)) 5)');

        console.log('[DEBUG] Initial atom:', atom.toString());

        const step1 = interpreter.step(atom);
        console.log('[DEBUG] After step 1:', step1.reduced.toString(), 'Applied:', step1.applied);

        if (step1.applied) {
            const step2 = interpreter.step(step1.reduced);
            console.log('[DEBUG] After step 2:', step2.reduced.toString(), 'Applied:', step2.applied);
        }
    });

    test('let binding works (uses &subst internally)', () => {
        const result = interpreter.run('(let $x 5 (* $x 2))');
        console.log('[DEBUG] Let binding result:', result[0]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('10');
    });

    test('map with lambda (integration test)', () => {
        const result = interpreter.run('(map (λ $x (* $x 2)) (: 1 (: 2 ())))');
        console.log('[DEBUG] Map with lambda result:', result[0]);
        console.log('[DEBUG] Result structure:', JSON.stringify(result[0], null, 2));

        // This may fail but gives us diagnostic info
        if (result[0]?.operator?.name === ':') {
            console.log('[DEBUG] First element:', result[0].components[0].name);
        }
    });
});
