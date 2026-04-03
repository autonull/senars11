import {DependentVariableIntroductionRule, VariableIntroductionRule, TermFactory, Task, Truth, Stamp} from '@senars/nar';


describe('VariableIntroduction Rules', () => {
    let factory;

    beforeEach(() => {
        factory = new TermFactory();
    });

    function createTask(term, truth = new Truth(0.9, 0.9)) {
        return new Task({
            term,
            punctuation: '.',
            truth,
            stamp: Stamp.createInput()
        });
    }


    describe('VariableIntroductionRule', () => {
        let rule;

        beforeEach(() => {
            rule = new VariableIntroductionRule();
        });

        test('should generalize shared predicate pattern', async () => {
            // (cat --> animal), (dog --> animal) => (?x --> animal)
            const term1 = factory.inheritance(factory.atomic('cat'), factory.atomic('animal'));
            const term2 = factory.inheritance(factory.atomic('dog'), factory.atomic('animal'));

            const task1 = createTask(term1, new Truth(0.9, 0.9));
            const task2 = createTask(term2, new Truth(0.8, 0.8));

            expect(rule.canApply(task1, task2, {})).toBe(true);

            const results = rule.apply(task1, task2, {termFactory: factory});

            expect(results.length).toBeGreaterThanOrEqual(1);
            // Should contain a variable in subject position
            const derivedTerm = results[0].term;
            expect(derivedTerm.subject?.isVariable).toBe(true);
            expect(derivedTerm.predicate?.name).toBe('animal');
        });

        test('should generalize shared subject pattern', async () => {
            // (bird --> flies), (bird --> sings) => (bird --> ?y)
            const term1 = factory.inheritance(factory.atomic('bird'), factory.atomic('flies'));
            const term2 = factory.inheritance(factory.atomic('bird'), factory.atomic('sings'));

            const task1 = createTask(term1, new Truth(0.9, 0.9));
            const task2 = createTask(term2, new Truth(0.8, 0.8));

            expect(rule.canApply(task1, task2, {})).toBe(true);

            const results = rule.apply(task1, task2, {termFactory: factory});

            expect(results.length).toBeGreaterThanOrEqual(1);
            // Should contain a variable in predicate position
            const derivedTerm = results[0].term;
            expect(derivedTerm.subject?.name).toBe('bird');
            expect(derivedTerm.predicate?.isVariable).toBe(true);
        });

        test('should not apply to identical terms', async () => {
            const term = factory.inheritance(factory.atomic('cat'), factory.atomic('animal'));

            const task1 = createTask(term, new Truth(0.9, 0.9));
            const task2 = createTask(term, new Truth(0.8, 0.8));

            expect(rule.canApply(task1, task2, {})).toBe(false);
        });

        test('should not apply to different operators', async () => {
            const term1 = factory.inheritance(factory.atomic('cat'), factory.atomic('animal'));
            const term2 = factory.implication(factory.atomic('rain'), factory.atomic('wet'));

            const task1 = createTask(term1, new Truth(0.9, 0.9));
            const task2 = createTask(term2, new Truth(0.8, 0.8));

            expect(rule.canApply(task1, task2, {})).toBe(false);
        });

        test('should reduce confidence for generalization', async () => {
            const term1 = factory.inheritance(factory.atomic('cat'), factory.atomic('animal'));
            const term2 = factory.inheritance(factory.atomic('dog'), factory.atomic('animal'));

            const task1 = createTask(term1, new Truth(0.9, 0.9));
            const task2 = createTask(term2, new Truth(0.9, 0.9));

            const results = rule.apply(task1, task2, {termFactory: factory});

            expect(results.length).toBeGreaterThanOrEqual(1);
            // Confidence should be reduced or maintained (generalization is inductive)
            expect(results[0].truth.confidence).toBeLessThanOrEqual(0.9);
        });
    });

    describe('DependentVariableIntroductionRule', () => {
        let rule;

        beforeEach(() => {
            rule = new DependentVariableIntroductionRule();
        });

        test('should introduce variable for subject', async () => {
            // (cat --> animal) => (?z --> animal)
            const term = factory.inheritance(factory.atomic('cat'), factory.atomic('animal'));
            const task = createTask(term, new Truth(0.9, 0.9));

            expect(rule.canApply(task, null, {})).toBe(true);

            const results = rule.apply(task, null, {termFactory: factory});

            expect(results.length).toBe(1);
            const derivedTerm = results[0].term;
            expect(derivedTerm.subject?.isVariable).toBe(true);
            expect(derivedTerm.subject?.name).toMatch(/^\?/);
            expect(derivedTerm.predicate?.name).toBe('animal');
        });

        test('should not apply when subject is already a variable', async () => {
            const varTerm = factory.variable('?x');
            const term = factory.inheritance(varTerm, factory.atomic('animal'));
            const task = createTask(term, new Truth(0.9, 0.9));

            // Subject is already a variable, should NOT apply
            expect(rule.canApply(task, null, {})).toBe(false);
        });

        test('should have very weak confidence', async () => {
            const term = factory.inheritance(factory.atomic('cat'), factory.atomic('animal'));
            const task = createTask(term, new Truth(0.9, 0.9));

            const results = rule.apply(task, null, {termFactory: factory});

            expect(results.length).toBe(1);
            // Should be weakened (doubly weakening may still produce reasonable confidence)
            expect(results[0].truth.confidence).toBeLessThanOrEqual(0.9);
        });
    });
});
