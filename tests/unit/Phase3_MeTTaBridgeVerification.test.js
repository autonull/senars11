import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { SeNARSBridge } from '../../metta/src/SeNARSBridge.js';
import { Task } from '../../core/src/task/Task.js';
import { TermFactory } from '../../core/src/term/TermFactory.js';
import { Truth } from '../../core/src/Truth.js';

describe.skip('Phase 3.1: MeTTa Bridge Verification', () => {
    let termFactory;
    let mockInterpreter;
    let mockReasoner;
    let bridge;

    beforeEach(() => {
        termFactory = new TermFactory();

        mockInterpreter = {
            termFactory,
            parser: { parseExpression: jest.fn(str => termFactory.create(str)) },
            load: jest.fn(),
            space: { size: jest.fn(() => 42) }
        };

        mockReasoner = {
            derive: jest.fn(() => []),
            deriveWith: jest.fn(() => []),
            process: jest.fn(),
            memory: {
                getBeliefs: jest.fn(() => []),
                getConcept: jest.fn(),
                getAllConcepts: jest.fn(() => [])
            },
            ruleProcessor: {
                ruleExecutor: {
                    registerRule: jest.fn()
                }
            }
        };

        bridge = new SeNARSBridge(mockReasoner, mockInterpreter, {}, { emit: jest.fn() });
    });

    describe('SeNARSBridge', () => {
        test('mettaToNars converts Term to Task', () => {
            const term = termFactory.create('(A --> B)');
            const task = bridge.mettaToNars(term, '.');

            expect(task).toBeInstanceOf(Task);
            expect(task.term).toBe(term);
            expect(task.punctuation).toBe('.');
            expect(task.truth).toBeDefined();
        });

        test('narsToMetta converts Task to Term', () => {
            const term = termFactory.create('(A --> B)');
            const task = new Task({ term, punctuation: '.', truth: new Truth(1.0, 0.9) });

            const result = bridge.narsToMetta(task);
            expect(result).toBe(term);
        });

        test('queryWithReasoning delegates to Reasoner', () => {
            const query = '(query)';
            mockReasoner.derive.mockReturnValue([
                new Task({ term: termFactory.create('result'), punctuation: '.', truth: new Truth(1.0, 0.9) })
            ]);

            const results = bridge.queryWithReasoning(query);

            expect(mockInterpreter.parser.parseExpression).toHaveBeenCalledWith(query);
            expect(mockReasoner.derive).toHaveBeenCalled();
            expect(results.length).toBe(1);
        });

        test('injectRule registers MeTTaRuleAdapter', () => {
            const ruleTerm = { components: ['condition', 'result'] };

            bridge.injectRule(ruleTerm);

            expect(mockReasoner.ruleProcessor.ruleExecutor.registerRule).toHaveBeenCalled();
            const callArgs = mockReasoner.ruleProcessor.ruleExecutor.registerRule.mock.calls[0];
            const rule = callArgs[0];
            expect(rule.constructor.name).toBe('MeTTaRuleAdapter');
        });

        test('importToSeNARS loads from interpreter and processes tasks', () => {
             const code = '(some code)';
             const mockTask = { term: termFactory.create('term'), punctuation: '.' };
             mockInterpreter.load.mockReturnValue([mockTask]);

             bridge.importToSeNARS(code);

             expect(mockInterpreter.load).toHaveBeenCalledWith(code);
             expect(mockReasoner.process).toHaveBeenCalled();
        });
    });
});
