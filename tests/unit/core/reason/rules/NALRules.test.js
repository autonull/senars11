
import { InductionRule, AbductionRule } from '../../../../../core/src/reason/rules/nal/InductionAbductionRule.js';
import { InheritanceSyllogisticRule } from '../../../../../core/src/reason/rules/nal/SyllogisticRule.js';
import { ConversionRule } from '../../../../../core/src/reason/rules/nal/ConversionRule.js';
import { Truth } from '../../../../../core/src/Truth.js';
import { TermFactory } from '../../../../../core/src/term/TermFactory.js';
import { Task } from '../../../../../core/src/task/Task.js';

describe('NAL Inference Rules', () => {
    let factory;
    let context;

    beforeEach(() => {
        factory = new TermFactory();
        context = { termFactory: factory };
    });

    function createTask(term, f, c) {
        return new Task({
            term,
            truth: new Truth(f, c),
            stamp: { id: 'test', derivations: [] },
            budget: { priority: 0.8 }
        });
    }

    describe('Induction Rule', () => {
        const rule = new InductionRule();

        test('should apply to shared subject', () => {
            // (M --> P), (M --> S) |- (S --> P)
            const m = factory.create('M');
            const p = factory.create('P');
            const s = factory.create('S');

            const p1 = createTask(factory.create('-->', [m, p]), 1.0, 0.9);
            const p2 = createTask(factory.create('-->', [m, s]), 1.0, 0.9);

            const results = rule.apply(p1, p2, context);
            expect(results).toHaveLength(1);

            const res = results[0];
            expect(res.term.toString()).toBe('(-->, S, P)');

            // Truth.induction(1.0, 0.9)
            // w = f2*c1*c2 = 1.0*0.9*0.9 = 0.81
            // c = w/(w+1) = 0.81/1.81 = 0.4475
            // f = f1 = 1.0
            expect(res.truth.frequency).toBe(1.0);
            expect(res.truth.confidence).toBeCloseTo(0.81 / 1.81);
        });
    });

    describe('Abduction Rule', () => {
        const rule = new AbductionRule();

        test('should apply to shared predicate', () => {
            // (P --> M), (S --> M) |- (S --> P)
            const m = factory.create('M');
            const p = factory.create('P');
            const s = factory.create('S');

            const p1 = createTask(factory.create('-->', [p, m]), 1.0, 0.9);
            const p2 = createTask(factory.create('-->', [s, m]), 1.0, 0.9);

            const results = rule.apply(p1, p2, context);
            expect(results).toHaveLength(1);

            const res = results[0];
            expect(res.term.toString()).toBe('(-->, S, P)');

            // Truth.abduction
            // w = f1*c1*c2 = 1.0*0.9*0.9 = 0.81
            // c = w/(w+1) = 0.4475
            // f = f2 = 1.0
            expect(res.truth.frequency).toBe(1.0);
            expect(res.truth.confidence).toBeCloseTo(0.81 / 1.81);
        });
    });

    describe('Syllogistic Rule (Deduction)', () => {
        const rule = new InheritanceSyllogisticRule();

        test('should apply to chain (S-->M, M-->P)', () => {
            const s = factory.create('S');
            const m = factory.create('M');
            const p = factory.create('P');

            const p1 = createTask(factory.create('-->', [s, m]), 1.0, 0.9);
            const p2 = createTask(factory.create('-->', [m, p]), 1.0, 0.9);

            const results = rule.apply(p1, p2, context);
            expect(results).toHaveLength(1);

            const res = results[0];
            expect(res.term.toString()).toBe('(-->, S, P)');

            // Truth.deduction
            // f = f1*f2 = 1.0
            // c = c1*c2 = 0.81
            expect(res.truth.frequency).toBe(1.0);
            expect(res.truth.confidence).toBeCloseTo(0.81);
        });
    });

    describe('Conversion Rule', () => {
        const rule = new ConversionRule();

        test('should reverse inheritance', () => {
            const s = factory.create('S');
            const p = factory.create('P');

            const p1 = createTask(factory.create('-->', [s, p]), 1.0, 0.9);

            const results = rule.apply(p1, null, context);
            expect(results).toHaveLength(1);

            const res = results[0];
            expect(res.term.toString()).toBe('(-->, P, S)');

            // Truth.conversion
            // f = 1.0
            // c = f*c = 0.9
            expect(res.truth.frequency).toBe(1.0);
            expect(res.truth.confidence).toBeCloseTo(0.9);
        });
    });
});
