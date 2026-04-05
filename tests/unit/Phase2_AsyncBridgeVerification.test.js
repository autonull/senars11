import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import {LMRule, Task, TermFactory, Truth} from '@senars/nar';

describe('Phase 2.1: Async Neural-Symbolic Bridge Verification', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    test('LMRule executes asynchronously without blocking', async () => {
        const mockLM = {
            generateText: jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50)); // Simulated delay
                return 'result';
            })
        };

        const rule = new LMRule('async-test', mockLM, {
            name: 'AsyncTest',
            condition: () => true,
            prompt: () => 'prompt',
            process: (r) => r,
            generate: (r, p, s, c) => [new Task({
                term: c.termFactory.atomic('result'),
                punctuation: '.',
                truth: new Truth(1.0, 0.9)
            })]
        });

        const primary = new Task({term: termFactory.atomic('test'), punctuation: '.', truth: new Truth(1.0, 0.9)});
        const context = {termFactory};

        const startTime = Date.now();
        const promise = rule.apply(primary, null, context);

        // Immediate check: promise should be pending (not strictly checkable, but execution continues)
        // If it were blocking (sync), we would wait 50ms before reaching here.
        // However, since we await in test, this verifies it RETURNS a promise.
        expect(promise).toBeInstanceOf(Promise);

        const results = await promise;
        const duration = Date.now() - startTime;

        expect(results.length).toBe(1);
        expect(duration).toBeGreaterThanOrEqual(45); // Roughly 50ms
    });

    test('CircuitBreaker activates on repeated failures', async () => {
        const mockLM = {
            generateText: jest.fn().mockRejectedValue(new Error('LM Failure'))
        };

        const rule = new LMRule('cb-test', mockLM, {
            condition: () => true,
            prompt: () => 'prompt',
            circuitBreaker: {failureThreshold: 3, resetTimeout: 1000}
        });

        const primary = new Task({term: termFactory.atomic('test'), punctuation: '.', truth: new Truth(1.0, 0.9)});

        // Fail 3 times
        await rule.apply(primary);
        await rule.apply(primary);
        await rule.apply(primary);

        // 4th time should be blocked immediately (circuit open)
        // canApply checks circuit state
        expect(rule.canApply(primary)).toBe(false);

        // Apply should return empty array immediately
        const res = await rule.apply(primary);
        expect(res).toEqual([]);

        // Verify mock wasn't called the 4th time (only 3 failures)
        expect(mockLM.generateText).toHaveBeenCalledTimes(3);
    });
});
