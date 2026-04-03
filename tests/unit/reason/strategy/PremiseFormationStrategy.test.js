import {DecompositionStrategy, TermLinkStrategy, TaskMatchStrategy, PremiseFormationStrategy, TermFactory, Task, Truth} from '@senars/nar';

let factory;

beforeEach(() => {
    factory = new TermFactory();
});

describe('PremiseFormationStrategy base class', () => {
    test('should have configurable priority', () => {
        const strategy = new PremiseFormationStrategy({priority: 0.7});
        expect(strategy.priority).toBe(0.7);

        strategy.priority = 0.5;
        expect(strategy.priority).toBe(0.5);
    });

    test('should track statistics', () => {
        const strategy = new PremiseFormationStrategy();
        expect(strategy.stats.candidatesGenerated).toBe(0);

        strategy.recordSuccess();
        expect(strategy.stats.successfulPairs).toBe(1);
    });

    test('should be toggleable', () => {
        const strategy = new PremiseFormationStrategy({enabled: false});
        expect(strategy.enabled).toBe(false);

        strategy.enabled = true;
        expect(strategy.enabled).toBe(true);
    });
});

describe('DecompositionStrategy', () => {
    test('should decompose inheritance statement to subject and predicate', async () => {
        const strategy = new DecompositionStrategy();
        const term = factory.inheritance(factory.atomic('cat'), factory.atomic('animal'));
        const task = new Task({term, punctuation: '.', truth: new Truth(0.9, 0.9)});

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(2);
        expect(candidates[0].term.name).toBe('cat');
        expect(candidates[0].type).toBe('decomposed-subject');
        expect(candidates[1].term.name).toBe('animal');
        expect(candidates[1].type).toBe('decomposed-predicate');
    });

    test('should decompose implication statement', async () => {
        const strategy = new DecompositionStrategy();
        const term = factory.implication(factory.atomic('rain'), factory.atomic('wet'));
        const task = new Task({term, punctuation: '.', truth: new Truth(0.8, 0.8)});

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(2);
        expect(candidates.some(c => c.term.name === 'rain')).toBe(true);
        expect(candidates.some(c => c.term.name === 'wet')).toBe(true);
    });

    test('should decompose conjunction to components', async () => {
        const strategy = new DecompositionStrategy();
        const term = factory.conjunction([factory.atomic('A'), factory.atomic('B'), factory.atomic('C')]);
        const task = new Task({term, punctuation: '.', truth: new Truth(0.9, 0.9)});

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(3);
        expect(candidates.every(c => c.type === 'decomposed-component')).toBe(true);
    });

    test('should not decompose atomic terms', async () => {
        const strategy = new DecompositionStrategy();
        const term = factory.atomic('simple');
        const task = new Task({term, punctuation: '.', truth: new Truth(0.9, 0.9)});

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(0);
    });

    test('should respect enabled flag', async () => {
        const strategy = new DecompositionStrategy({enabled: false});
        const term = factory.inheritance(factory.atomic('a'), factory.atomic('b'));
        const task = new Task({term, punctuation: '.', truth: new Truth(0.9, 0.9)});

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(0);
    });
});

describe('TaskMatchStrategy', () => {
    test('should score high compatibility for syllogistic chain', async () => {
        const strategy = new TaskMatchStrategy();

        // (A --> M) and (M --> B) should be highly compatible
        const term1 = factory.inheritance(factory.atomic('A'), factory.atomic('M'));
        const term2 = factory.inheritance(factory.atomic('M'), factory.atomic('B'));

        const task1 = new Task({term: term1, punctuation: '.', truth: new Truth(0.9, 0.9), budget: {priority: 0.8}});
        const task2 = new Task({term: term2, punctuation: '.', truth: new Truth(0.8, 0.8), budget: {priority: 0.7}});

        // Mock focus with task2
        const mockFocus = {
            getTasks: () => [task2]
        };

        const candidates = [];
        for await (const c of strategy.generateCandidates(task1, {focus: mockFocus})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(1);
        expect(candidates[0].compatibility).toBe(0.95); // High compatibility for syllogistic pattern
    });

    test('should score medium compatibility for shared terms', async () => {
        const strategy = new TaskMatchStrategy();

        // (A --> M) and (A --> B) share subject A
        const term1 = factory.inheritance(factory.atomic('A'), factory.atomic('M'));
        const term2 = factory.inheritance(factory.atomic('A'), factory.atomic('B'));

        const task1 = new Task({term: term1, punctuation: '.', truth: new Truth(0.9, 0.9), budget: {priority: 0.8}});
        const task2 = new Task({term: term2, punctuation: '.', truth: new Truth(0.8, 0.8), budget: {priority: 0.7}});

        const mockFocus = {getTasks: () => [task2]};

        const candidates = [];
        for await (const c of strategy.generateCandidates(task1, {focus: mockFocus})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(1);
        expect(candidates[0].compatibility).toBe(0.7); // Medium compatibility
    });

    test('should not pair task with itself', async () => {
        const strategy = new TaskMatchStrategy();

        const term = factory.inheritance(factory.atomic('A'), factory.atomic('B'));
        const task = new Task({term, punctuation: '.', truth: new Truth(0.9, 0.9), budget: {priority: 0.8}});

        const mockFocus = {getTasks: () => [task]}; // Focus only contains the same task

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {focus: mockFocus})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(0);
    });
});

describe('TermLinkStrategy', () => {
    test('should yield candidates from term links', async () => {
        const strategy = new TermLinkStrategy();

        const sourceTerm = factory.atomic('cat');
        const targetTerm = factory.atomic('animal');
        const task = new Task({term: sourceTerm, punctuation: '.', truth: new Truth(0.9, 0.9)});

        // Mock TermLayer
        const mockTermLayer = {
            get: (term) => {
                if (term.name === 'cat') {
                    return [{target: targetTerm, data: {priority: 0.8}}];
                }
                return [];
            }
        };

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {termLayer: mockTermLayer})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(1);
        expect(candidates[0].term.name).toBe('animal');
        expect(candidates[0].type).toBe('term-link');
    });

    test('should return empty for terms without links', async () => {
        const strategy = new TermLinkStrategy();

        const term = factory.atomic('unknown');
        const task = new Task({term, punctuation: '.', truth: new Truth(0.9, 0.9)});

        const mockTermLayer = {get: () => []};

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {termLayer: mockTermLayer})) {
            candidates.push(c);
        }

        expect(candidates.length).toBe(0);
    });

    test('should respect minLinkPriority', async () => {
        const strategy = new TermLinkStrategy({minLinkPriority: 0.5});

        const sourceTerm = factory.atomic('cat');
        const task = new Task({term: sourceTerm, punctuation: '.', truth: new Truth(0.9, 0.9)});

        const mockTermLayer = {
            get: () => [
                {target: factory.atomic('high'), data: {priority: 0.8}},
                {target: factory.atomic('low'), data: {priority: 0.3}}
            ]
        };

        const candidates = [];
        for await (const c of strategy.generateCandidates(task, {termLayer: mockTermLayer})) {
            candidates.push(c);
        }

        // Only high priority link should be included
        expect(candidates.length).toBe(1);
        expect(candidates[0].term.name).toBe('high');
    });
});
