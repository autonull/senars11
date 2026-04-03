import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {createNarsGPTQARule, createNarsGPTBeliefRule, createNarsGPTGoalRule, NarsGPTPrompts, Punctuation} from '@senars/nar';

const mockLM = (response = 'Mock') => ({generateText: jest.fn().mockResolvedValue(response)});
const mockStrategy = () => ({
    buildAttentionBuffer: jest.fn().mockResolvedValue([{
        task: {
            term: {toString: () => '(bird --> animal)'},
            truth: {f: 0.9, c: 0.8}
        }
    }]),
    checkGrounding: jest.fn().mockResolvedValue({grounded: true, match: null, similarity: 0.9})
});

const task = (punc, termStr) => ({
    term: {toString: () => termStr, name: termStr, isAtomic: true},
    punctuation: punc,
    truth: punc === Punctuation.BELIEF ? {f: 0.9, c: 0.8} : punc === Punctuation.GOAL ? {f: 0.9, c: 0.9} : null,
    budget: {priority: 0.8}
});

describe('NarsGPTPrompts', () => {
    describe('formatBuffer', () => {
        it('formats empty buffer', () => {
            expect(NarsGPTPrompts.formatBuffer([])).toContain('No relevant');
        });

        it('formats buffer with items', () => {
            const buffer = [{task: {term: {toString: () => '(a --> b)'}, truth: {f: 0.9, c: 0.8}}}];
            const result = NarsGPTPrompts.formatBuffer(buffer);
            expect(result).toContain('1.');
            expect(result).toContain('(a --> b)');
        });

        it('formats negated beliefs (f < 0.5) with NOT prefix', () => {
            const buffer = [{task: {term: {toString: () => '(penguin --> flyer)'}, truth: {f: 0.1, c: 0.7}}}];
            const result = NarsGPTPrompts.formatBuffer(buffer);
            expect(result).toContain('NOT:');
            expect(result).toContain('0.90');
        });
    });

    describe('prompts', () => {
        it('generates question prompt', () => {
            const prompt = NarsGPTPrompts.question('Context', 'What is X?');
            expect(prompt).toContain('Context');
            expect(prompt).toContain('What is X?');
            expect(prompt).toContain('memory items');
        });

        it('generates belief prompt', () => {
            const prompt = NarsGPTPrompts.belief('Context', 'Dogs are animals');
            expect(prompt).toContain('Dogs are animals');
            expect(prompt).toContain('inheritance');
        });
    });
});

describe('LMNarsGPTQARule', () => {
    let rule;

    beforeEach(() => {
        rule = createNarsGPTQARule({lm: mockLM('The bird can fly.'), narsGPTStrategy: mockStrategy()});
    });

    it('has correct id', () => expect(rule.id).toBe('narsgpt-qa'));
    it('matches question tasks', () => expect(rule.config.condition(task(Punctuation.QUESTION, 'What can fly?'))).toBe(true));
    it('does not match belief tasks', () => expect(rule.config.condition(task(Punctuation.BELIEF, '(bird --> animal)'))).toBe(false));
});

describe('LMNarsGPTBeliefRule', () => {
    let rule;

    beforeEach(() => {
        rule = createNarsGPTBeliefRule({lm: mockLM('(dog --> animal). {0.9 0.8}'), narsGPTStrategy: mockStrategy()});
    });

    it('has correct id', () => expect(rule.id).toBe('narsgpt-belief'));
    it('matches natural language belief tasks', () => expect(rule.config.condition(task(Punctuation.BELIEF, '"Dogs are animals"'))).toBe(true));

    it('does not match structured Narsese', () => {
        const narseseTask = {
            term: {toString: () => '(a --> b)', name: 'a --> b', isAtomic: false},
            punctuation: Punctuation.BELIEF
        };
        expect(rule.config.condition(narseseTask)).toBe(false);
    });
});

describe('LMNarsGPTGoalRule', () => {
    let rule, strategy;

    beforeEach(() => {
        strategy = mockStrategy();
        rule = createNarsGPTGoalRule({lm: mockLM('1. Find food!\n2. Go to forest!'), narsGPTStrategy: strategy});
    });

    it('has correct id', () => expect(rule.id).toBe('narsgpt-goal'));

    it('matches goal tasks', async () => {
        const result = await rule.config.condition(task(Punctuation.GOAL, '(achieve --> happiness)'));
        expect(result).toBe(true);
    });

    it('rejects ungrounded goals', async () => {
        strategy.checkGrounding.mockResolvedValue({grounded: false});
        const result = await rule.config.condition(task(Punctuation.GOAL, '(unknown --> goal)'));
        expect(result).toBe(false);
    });
});
