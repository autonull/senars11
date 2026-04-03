import {MeTTaInterpreter} from '@senars/metta/src/MeTTaInterpreter.js';
import {Term, sym, exp, var_, var_ as v} from '@senars/metta/src/kernel/Term.js';
import {Unify} from '@senars/metta/src/kernel/Unify.js';
import path from 'path';

const stdlibDir = path.resolve(process.cwd(), 'metta/src/stdlib');

describe('Intermediate Tests (Let*, Closures)', () => {
    let interpreter;

    beforeEach(() => {
        Term.clearSymbolTable();
        interpreter = new MeTTaInterpreter({
            typeChecking: false,
            maxReductionSteps: 50000,
            loadStdlib: true,
            stdlibDir,
            modules: ['core']
        });
    });

    const run = (code) => {
        const res = interpreter.run(code);
        return res[res.length - 1]?.toString();
    };

    test('let* empty bindings', () => expect(run('!(let* () 42)')).toBe('42'));

    test('let* single binding', () => expect(run('!(let* (( $x 1 )) $x)')).toBe('1'));

    test('let* dependent binding', () => expect(run('!(let* (( $x 1 ) ( $y (+ $x 1) )) $y)')).toBe('2'));

    test('manual let', () => expect(run('!(let $x 1 $x)')).toBe('1'));

    test('closure capture', () => {
        const code = `
            (= (make-adder $val) (λ $x (+ $x $val)))
            !((make-adder 10) 5)
         `;
        expect(run(code)).toBe('15');
    });

    test('explicit substitution', () => {
        const tmpl = exp(sym('+'), [v('x'), sym('1')]);
        const bindings = {'$x': sym('10')};
        const res = Unify.subst(tmpl, bindings);
        expect(res.toString()).toBe('(+ 10 1)');
    });
});
