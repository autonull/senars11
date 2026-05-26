import {LMRuleFactory} from '@senars/nar/src/lm/LMRuleFactory.js';
import {LM} from '../../../core/src/lm/LM.js';
import {DummyProvider} from '@senars/core';

describe('LMRuleFactory', () => {
    let lm;

    beforeEach(async () => {
        lm = new LM();
        await lm.initialize();
        lm.registerProvider('test-provider', new DummyProvider({id: 'test-provider'}));
    });

    test('create basic rule', () => {
        const rule = LMRuleFactory.create({
            id: 'test-rule', lm,
            promptTemplate: 'T: {{taskTerm}}',
            responseProcessor: async () => [],
            priority: 0.7
        });

        expect(rule).toMatchObject({
            id: 'test-rule', lm, priority: 0.7, promptTemplate: 'T: {{taskTerm}}'
        });
    });

    test('validate required params', () => {
        [{}, {id: 'x'}, {lm}].forEach(params => {
            expect(() => LMRuleFactory.create(params)).toThrow();
        });
    });

    test('factory methods', () => {
        const simple = LMRuleFactory.createSimple({
            id: 's1', lm, promptTemplate: 'T', priority: 0.6
        });
        expect(simple).toMatchObject({id: 's1', priority: 0.6});

        const inf = LMRuleFactory.createInferenceRule({id: 'i1', lm, priority: 0.5});
        expect(inf).toMatchObject({id: 'i1', priority: 0.5});
        expect(inf.promptTemplate).toContain('Given the task');

        const hypo = LMRuleFactory.createHypothesisRule({id: 'h1', lm, priority: 0.4});
        expect(hypo).toMatchObject({id: 'h1', priority: 0.4});
        expect(hypo.promptTemplate).toContain('hypothesis');
    });
});
