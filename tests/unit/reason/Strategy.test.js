import {jest} from '@jest/globals';
import {Strategy} from '@senars/nar';
import {createTestTask} from '../../support/index.js';

describe('Strategy', () => {
    let strategy;
    beforeEach(() => {
        strategy = new Strategy();
    });

    test('config', () => {
        expect(strategy.config.maxSecondaryPremises).toBe(10);
        expect(new Strategy({maxSecondaryPremises: 5}).config.maxSecondaryPremises).toBe(5);
    });

    test('selection', async () => {
        expect(await strategy.selectSecondaryPremises(createTestTask({term: 'p'}))).toEqual([]);

        const sub = {selectSecondaryPremises: jest.fn().mockResolvedValue([createTestTask({term: 'sub'})])};
        strategy.addStrategy(sub);

        const res = await strategy.selectSecondaryPremises(createTestTask({term: 'p'}));
        expect(res[0].term.toString()).toBe('sub');

        const strategy2 = new Strategy();
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {
        });
        strategy2.premiseSelector = {
            select: () => {
                throw new Error('Error');
            }
        };
        expect(await strategy2.selectSecondaryPremises(createTestTask({term: 'p'}))).toEqual([]);
        spy.mockRestore();
    });

    test('pair generation', async () => {
        strategy.selectSecondaryPremises = async (p) => [createTestTask({term: `s-${p.term}`})];

        async function* stream() {
            yield createTestTask({term: 'p1'});
            yield createTestTask({term: 'p2'});
        }

        const pairs = [];
        for await (const p of strategy.generatePremisePairs(stream())) pairs.push(p);
        expect(pairs.length).toBeGreaterThanOrEqual(2);
    });

    test('status', () => {
        expect(new Strategy({maxSecondaryPremises: 8}).getStatus()).toMatchObject({
            type: 'Strategy', config: {maxSecondaryPremises: 8}
        });
    });
});
