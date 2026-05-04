import {jest} from '@jest/globals';
import {CircuitBreaker, withCircuitBreaker} from '@senars/core/src/util/CircuitBreaker';

describe('CircuitBreaker', () => {
    let cb;
    beforeEach(() => {
        cb = new CircuitBreaker();
    });

    test('initial state', () => {
        expect(cb.getState().state).toBe('CLOSED');
    });

    test('execution success', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        expect(await cb.execute(fn)).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('failure threshold', async () => {
        cb = new CircuitBreaker({failureThreshold: 2});
        const fail = () => Promise.reject(new Error('fail'));

        await expect(cb.execute(fail)).rejects.toThrow('fail');
        expect(cb.getState().state).toBe('CLOSED');

        await expect(cb.execute(fail)).rejects.toThrow('fail');
        expect(cb.getState().state).toBe('OPEN');

        // Next call blocked
        await expect(cb.execute(fail)).rejects.toThrow('Circuit breaker is OPEN');
    });

    test('timeout', async () => {
        cb = new CircuitBreaker({timeout: 10});
        const slowFn = () => new Promise(r => setTimeout(r, 20));

        await expect(cb.execute(slowFn)).rejects.toThrow(/timed out/);
        // Timeout counts as failure? Usually yes.
        expect(cb.failureCount).toBe(1);
    });

    test('half-open recovery', async () => {
        cb = new CircuitBreaker({failureThreshold: 1, resetTimeout: 10});

        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
        expect(cb.getState().state).toBe('OPEN');

        await new Promise(r => setTimeout(r, 20)); // Wait for reset timeout

        // First call probes (Half-Open)
        const success = jest.fn().mockResolvedValue('ok');
        expect(await cb.execute(success)).toBe('ok');
        expect(cb.getState().state).toBe('CLOSED');
    });

    test('decorator', async () => {
        const fn = jest.fn().mockResolvedValue('ok');
        const protectedFn = withCircuitBreaker(fn, {failureThreshold: 1});
        expect(await protectedFn()).toBe('ok');
        expect(fn).toHaveBeenCalled();
    });
});
