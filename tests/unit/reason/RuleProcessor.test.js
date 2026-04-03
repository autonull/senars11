import {jest} from '@jest/globals';
import {RuleProcessor, SimpleRuleExecutor, Rule} from '@senars/nar';
import {createTestTask} from '../../support/baseTestUtils.js';

class TestRule extends Rule {
    constructor(id, type) {
        super(id, type, 1.0);
    }

    apply(p1, p2) {
        return [{id: `derived-${this.id}`, ruleId: this.id, primary: p1.id, secondary: p2.id}];
    }
}

describe('RuleProcessor', () => {
    let rp, re;
    beforeEach(() => {
        re = new SimpleRuleExecutor();
        rp = new RuleProcessor(re);
    });

    test('config', () => {
        expect(rp.config).toMatchObject({maxDerivationDepth: 10, backpressureThreshold: 50});
        expect(new RuleProcessor(re, {maxDerivationDepth: 5}).config.maxDerivationDepth).toBe(5);
    });

    test('utils', () => {
        Object.assign(rp, {syncRuleExecutions: 5});
        expect(rp.getStats().syncRuleExecutions).toBe(5);
        rp.resetStats();
        expect(rp.getStats().syncRuleExecutions).toBe(0);
        expect(rp.getStatus().backpressure).toBeDefined();
    });

    test('derivation check', () => {
        const spy = jest.spyOn(console, 'debug').mockImplementation(() => {
        });
        expect(rp._processDerivation({id: 'valid', stamp: {depth: 5}})).toBeDefined();
        expect(rp._processDerivation({id: 'invalid', stamp: {depth: 15}})).toBeNull();
        spy.mockRestore();
    });

    test('backpressure', async () => {
        rp.asyncResultsQueue = {size: 60};
        const start = Date.now();
        await rp._checkAndApplyBackpressure();
        expect(Date.now() - start).toBeGreaterThanOrEqual(3);

        rp.asyncResultsQueue = {size: 10};
        const start2 = Date.now();
        await rp._checkAndApplyBackpressure();
        expect(Date.now() - start2).toBeLessThan(10);
    });

    test('execution', async () => {
        re.register(new TestRule('sync', 'nal'));

        async function* stream() {
            yield [createTestTask({id: 'p1'}), createTestTask({id: 'p2'})];
        }

        const results = [];
        for await (const r of rp.process(stream())) results.push(r);
        expect(results.length).toBeGreaterThan(0);
    });
});
