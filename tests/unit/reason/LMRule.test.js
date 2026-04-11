import {
    createGoalDecompositionRule,
    createHypothesisGenerationRule,
    LMRule,
    Punctuation,
    Task,
    TermFactory,
    Truth
} from '@senars/nar';
import {jest} from '@jest/globals';

class MockLM {
    constructor(responses = {}) {
        this.responses = responses;
    }

    async generateText(prompt, options = {}) {
        const key = Object.keys(this.responses).find(pattern => prompt.includes(pattern));
        if (key) {
            return this.responses[key];
        }
        return "Default mock response";
    }

    async process(prompt, options = {}) {
        return this.generateText(prompt, options);
    }

    async query(prompt, options = {}) {
        return this.generateText(prompt, options);
    }
}

describe('LMRule', () => {
    let mockLM;
    let termFactory;

    beforeEach(() => {
        mockLM = new MockLM({
            "decompose": "Sub-goal: research topic\nSub-goal: create outline\nSub-goal: write draft",
            "hypothesis": "Regular exercise improves mental health",
            "causal": "rain --> wet streets"
        });
        termFactory = new TermFactory();
    });

    test('should create rule with basic configuration', () => {
        const rule = LMRule.create({
            id: 'test-rule',
            lm: mockLM,
            name: 'Test Rule',
            description: 'A test rule'
        });

        expect(rule.id).toBe('test-rule');
        expect(rule.name).toBe('Test Rule');
        expect(rule.lm).toBe(mockLM);
    });

    test('should apply basic condition function', () => {
        const rule = LMRule.create({
            id: 'conditional-rule',
            lm: mockLM,
            condition: (primary, secondary, context) => primary && primary.term?.name === 'test'
        });

        const testTask = new Task({
            term: termFactory.atomic('test'),
            punctuation: Punctuation.BELIEF,
            truth: {frequency: 0.9, confidence: 0.9}
        });
        const otherTask = new Task({
            term: termFactory.atomic('other'),
            punctuation: Punctuation.BELIEF,
            truth: {frequency: 0.9, confidence: 0.9}
        });

        expect(rule.canApply(testTask, null, {})).toBe(true);
        expect(rule.canApply(otherTask, null, {})).toBe(false);
    });

    test('should generate prompt using template', () => {
        const rule = LMRule.create({
            id: 'prompt-test',
            lm: mockLM,
            promptTemplate: 'Process: {{taskTerm}}',
            process: (response) => response,
            generate: (output) => []
        });

        const testTask = new Task({
            term: termFactory.atomic('sample term'),
            punctuation: Punctuation.BELIEF,
            truth: {frequency: 0.9, confidence: 0.9}
        });
        const prompt = rule.generatePrompt(testTask, null, {});

        expect(prompt).toBe('Process: sample term');
    });

    test('should execute LM and process result', async () => {
        const rule = LMRule.create({
            id: 'process-test',
            lm: mockLM,
            condition: () => true,
            prompt: () => 'decompose test goal',
            process: (response) => response.split('\n').filter(line => line.trim()),
            generate: (output) => output.map(item => new Task({
                term: termFactory.atomic(item.trim()),
                punctuation: Punctuation.BELIEF,
                truth: {frequency: 0.9, confidence: 0.9}
            }))
        });

        const result = await rule.apply(new Task({
            term: termFactory.atomic('test goal'),
            punctuation: Punctuation.GOAL,
            truth: {frequency: 1.0, confidence: 0.9}
        }), null, {});

        expect(result).toHaveLength(3);
        expect(result[0].term.name).toContain('Sub-goal: research topic');
    });

    test('should handle errors gracefully', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
        });

        const errorLM = {
            generateText: () => {
                throw new Error('LM error');
            }
        };

        const rule = LMRule.create({
            id: 'error-test',
            lm: errorLM,
            condition: () => true,
            prompt: () => 'test prompt',
            process: (response) => response,
            generate: (output) => [new Task({
                term: termFactory.atomic(output),
                punctuation: Punctuation.BELIEF,
                truth: {frequency: 0.9, confidence: 0.9}
            })]
        });

        const result = await rule.apply(new Task({
            term: termFactory.atomic('test'),
            punctuation: Punctuation.BELIEF,
            truth: {frequency: 0.9, confidence: 0.9}
        }), null, {});
        expect(result).toEqual([]);

        consoleErrorSpy.mockRestore();
    });
});

describe('Specific LM Rules', () => {
    let mockLM;
    let termFactory;
    let context;

    beforeEach(() => {
        mockLM = new MockLM({
            "decompose": "Research the topic\nCreate an outline\nWrite the first draft\nReview and edit",
            "hypothesis": "Practicing regularly improves performance",
            "causal": "exercise --> improved health",
            "revision": "Revised belief with nuance",
            "explanation": "This is a simple explanation of the formal statement",
            "analogy": "This works like how studying improves knowledge",
            "variable": "value1\nvalue2\nvalue3",
            "clarification": "What specific aspect of this problem are you addressing?\nHow will you measure success?",
            "strategy": "Decomposition strategy is recommended for this complex problem",
            "schema": "IF condition THEN action",
            "calibration": "0.75"
        });
        termFactory = new TermFactory();
        context = {termFactory};
    });

    test('GoalDecompositionRule should decompose goals', () => {
        const rule = createGoalDecompositionRule({lm: mockLM, termFactory});

        const goalTask = new Task({
            term: termFactory.atomic('Write a report'),
            punctuation: Punctuation.GOAL,
            budget: {priority: 0.8},
            truth: new Truth(0.7, 0.9)
        });

        expect(rule.canApply(goalTask, null, context)).toBe(true);
    });

    test('HypothesisGenerationRule should generate hypotheses', () => {
        const rule = createHypothesisGenerationRule({lm: mockLM, termFactory});

        const beliefTask = new Task({
            term: termFactory.atomic('Regular exercise is beneficial'),
            punctuation: Punctuation.BELIEF,
            budget: {priority: 0.8},
            truth: new Truth(0.8, 0.9)
        });

        expect(rule.canApply(beliefTask, null, context)).toBe(true);
    });
});

