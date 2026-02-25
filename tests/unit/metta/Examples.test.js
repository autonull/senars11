import { MeTTaInterpreter } from '@senars/metta/src/MeTTaInterpreter.js';
import { Term } from '@senars/metta/src/kernel/Term.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stdlibDir = path.resolve(__dirname, '../../../metta/src/stdlib');
const nalStdlibDir = path.resolve(__dirname, '../../../metta/src/nal/stdlib');

describe('Examples to Unit Tests Promotion', () => {
    let interpreter;

    beforeEach(() => {
        Term.clearSymbolTable();
        interpreter = new MeTTaInterpreter({
            typeChecking: false,
            maxReductionSteps: 50000,
            loadStdlib: true,
            stdlibDir,
            searchPaths: [stdlibDir, nalStdlibDir],
            modules: ['core', 'list', 'match', 'types', 'truth', 'nal']
        });
    });

    describe('Functional Programming', () => {
        const run = (code) => interpreter.run(code)[0]?.toString();
        const runLast = (code) => {
            const res = interpreter.run(code);
            return res[res.length - 1]?.toString();
        };

        test('basic lambda', () => expect(run('!((λ $x (* $x 2)) 5)')).toBe('10'));
        test('nested let', () => expect(run('!(let $x 10 (let $y 20 (+ $x $y)))')).toBe('30'));
        test('let*', () => expect(run('!(let* (( $x 10 ) ( $y 30 )) (+ $x $y))')).toBe('40'));

        test('recursion (factorial)', () => {
            const code = `
                (= (fact $n) (if (== $n 0) 1 (* $n (fact (- $n 1)))))
                !(fact 5)
            `;
            expect(runLast(code)).toBe('120');
        });

        test('closures', () => {
            const code = `
                (= (add-n $n) (λ $x (+ $x $n)))
                !((add-n 5) 10)
            `;
            expect(runLast(code)).toBe('15');
        });

        test('higher-order functions', () => {
            const code = `
                (= (apply-twice $f $x) ($f ($f $x)))
                !(apply-twice (λ $y (* $y 2)) 3)
            `;
            expect(runLast(code)).toBe('12');
        });
    });

    describe('NAL Deduction & Truth', () => {
        test('truth arithmetic', () => {
            const run = (code) => interpreter.run(code)[0]?.toString();
            expect(run('!(&+ 1 2)')).toBe('3');
            expect(run('!(&* 2 3)')).toBe('6');
            expect(run('!(&* 0.5 0.5)')).toBe('0.25');
        });

        test('Socrates deduction', () => {
            const code = `
                (Inh Socrates Human (1.0 0.9))
                (Inh Human Mortal (1.0 0.9))
                ! (query-derive (Inh Socrates Mortal))
            `;
            const results = interpreter.run(code).map(r => r.toString());
            const derived = results.find(s => s.includes('0.81') && s.includes('Inh') && s.includes('Mortal'));
            expect(derived).toBeDefined();
        });
    });
});
