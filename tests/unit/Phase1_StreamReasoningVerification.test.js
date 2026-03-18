import { describe, expect, test, beforeEach } from '@jest/globals';
import { TermFactory } from '../../core/src/term/TermFactory.js';
import { Truth } from '../../core/src/Truth.js';
import { Task } from '../../core/src/task/Task.js';
import { SimpleRuleExecutor } from '../../core/src/reason/exec/SimpleRuleExecutor.js';
import { InductionRule, AbductionRule } from '../../core/src/reason/rules/nal/InductionAbductionRule.js';
import { InheritanceSyllogisticRule } from '../../core/src/reason/rules/nal/SyllogisticRule.js';

describe('Phase 1.2: Stream Reasoning Verification', () => {
    let termFactory;
    let ruleExecutor;

    beforeEach(() => {
        termFactory = new TermFactory();
        ruleExecutor = new SimpleRuleExecutor();

        // Register the rules we want to verify
        ruleExecutor.register(new InductionRule());
        ruleExecutor.register(new AbductionRule());
        ruleExecutor.register(new InheritanceSyllogisticRule());
    });

    const createBelief = (term, f, c) => {
        return new Task({
            term,
            punctuation: '.',
            truth: new Truth(f, c)
        });
    };

    describe('1.2 Synchronous NAL Rules', () => {

        test('Deduction (InheritanceSyllogisticRule)', () => {
            // (robin --> bird) <1.0; 0.9>
            // (bird --> animal) <1.0; 0.9>
            // |- (robin --> animal)
            // Truth: deduction(t1, t2) -> f = f1*f2 = 1.0, c = c1*c2 = 0.81

            const robin = termFactory.atomic('robin');
            const bird = termFactory.atomic('bird');
            const animal = termFactory.atomic('animal');

            const t1 = createBelief(termFactory.inheritance(robin, bird), 1.0, 0.9);
            const t2 = createBelief(termFactory.inheritance(bird, animal), 1.0, 0.9);

            // Context requires termFactory for term creation
            const context = { termFactory };

            // Deduction typically works via shared term.
            // SyllogisticRule likely handles: (S-->M, M-->P) |- (S-->P)
            // t1 is S-->M (robin-->bird)
            // t2 is M-->P (bird-->animal)

            // The executor usually filters candidates. We can call executeRule directly for verification.
            const results = ruleExecutor.executeRule(new InheritanceSyllogisticRule(), t1, t2, context);

            expect(results.length).toBeGreaterThan(0);
            const conclusion = results[0];

            // Verify Term: (robin --> animal)
            expect(conclusion.term.operator).toBe('-->');
            expect(conclusion.term.subject.name).toBe('robin');
            expect(conclusion.term.predicate.name).toBe('animal');

            // Verify Truth: <1.0; 0.81>
            expect(conclusion.truth.frequency).toBeCloseTo(1.0);
            expect(conclusion.truth.confidence).toBeCloseTo(0.81);
        });

        test('Induction (InductionRule)', () => {
            // (swan --> bird) <1.0; 0.9>   (M --> P)
            // (swan --> swimmer) <1.0; 0.9> (M --> S)
            // |- (swimmer --> bird)        (S --> P)
            // Truth: induction(t1, t2)
            // w = f2 * c1 * c2 = 1.0 * 0.9 * 0.9 = 0.81
            // c = w / (w + 1) = 0.81 / 1.81 ≈ 0.4475
            // f = f1 = 1.0

            const swan = termFactory.atomic('swan');
            const bird = termFactory.atomic('bird');
            const swimmer = termFactory.atomic('swimmer');

            const t1 = createBelief(termFactory.inheritance(swan, bird), 1.0, 0.9);
            const t2 = createBelief(termFactory.inheritance(swan, swimmer), 1.0, 0.9);

            const context = { termFactory };

            // InductionRule expects shared subject.
            // t1: M-->P (swan-->bird)
            // t2: M-->S (swan-->swimmer)

            const results = ruleExecutor.executeRule(new InductionRule(), t1, t2, context);

            expect(results.length).toBeGreaterThan(0);
            const conclusion = results[0];

            // Verify Term: (swimmer --> bird) or (bird --> swimmer)?
            // InductionRule code says: subject = t2.predicate (swimmer), predicate = t1.predicate (bird)
            // So: (swimmer --> bird)
            expect(conclusion.term.operator).toBe('-->');
            expect(conclusion.term.subject.name).toBe('swimmer');
            expect(conclusion.term.predicate.name).toBe('bird');

            // Verify Truth
            expect(conclusion.truth.frequency).toBeCloseTo(1.0);
            const expectedW = 1.0 * 0.9 * 0.9;
            const expectedC = expectedW / (expectedW + 1);
            expect(conclusion.truth.confidence).toBeCloseTo(expectedC);
        });

        test('Abduction (AbductionRule)', () => {
            // (sport --> competition) <1.0; 0.9>  (P --> M)
            // (chess --> competition) <1.0; 0.9>  (S --> M)
            // |- (chess --> sport)                (S --> P)
            // Truth: abduction(t1, t2)
            // w = f1 * c1 * c2 = 1.0 * 0.9 * 0.9 = 0.81
            // c = w / (w + 1) = 0.81 / 1.81 ≈ 0.4475
            // f = f2 = 1.0

            const sport = termFactory.atomic('sport');
            const competition = termFactory.atomic('competition');
            const chess = termFactory.atomic('chess');

            const t1 = createBelief(termFactory.inheritance(sport, competition), 1.0, 0.9);
            const t2 = createBelief(termFactory.inheritance(chess, competition), 1.0, 0.9);

            const context = { termFactory };

            // AbductionRule expects shared predicate.
            // t1: P-->M (sport-->competition)
            // t2: S-->M (chess-->competition)

            const results = ruleExecutor.executeRule(new AbductionRule(), t1, t2, context);

            expect(results.length).toBeGreaterThan(0);
            const conclusion = results[0];

            // Verify Term: (chess --> sport)
            // AbductionRule code says: subject = t2.subject (chess), predicate = t1.subject (sport)
            expect(conclusion.term.operator).toBe('-->');
            expect(conclusion.term.subject.name).toBe('chess');
            expect(conclusion.term.predicate.name).toBe('sport');

            // Verify Truth
            expect(conclusion.truth.frequency).toBeCloseTo(1.0);
            const expectedW = 1.0 * 0.9 * 0.9;
            const expectedC = expectedW / (expectedW + 1);
            expect(conclusion.truth.confidence).toBeCloseTo(expectedC);
        });
    });
});
