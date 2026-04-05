import {Focus, ReasonerBuilder, RuleProcessor, Strategy, TaskBagPremiseSource, TermFactory} from '@senars/nar';
import {createTestMemory} from '../../support/index.js';

describe('ReasonerBuilder', () => {
    let context;
    beforeEach(() => {
        context = {focus: new Focus(), memory: createTestMemory(), termFactory: new TermFactory()};
    });

    test('default build', () => {
        const reasoner = new ReasonerBuilder(context).build();
        expect(reasoner.premiseSource).toBeInstanceOf(TaskBagPremiseSource);
        expect(reasoner.strategy).toBeInstanceOf(Strategy);
        expect(reasoner.ruleProcessor).toBeInstanceOf(RuleProcessor);
    });

    test('config', () => {
        const reasoner = new ReasonerBuilder(context).withConfig({maxDerivationDepth: 5}).build();
        expect(reasoner.config.maxDerivationDepth).toBe(5);
    });

    test('custom components', () => {
        const [ps, strat] = [new TaskBagPremiseSource(context.focus), new Strategy(context)];
        const reasoner = new ReasonerBuilder(context).withPremiseSource(ps).withStrategy(strat).build();
        expect(reasoner.premiseSource).toBe(ps);
        expect(reasoner.strategy).toBe(strat);
    });

    test('static build', () => {
        const reasoner = ReasonerBuilder.build({reasoning: {maxDerivationDepth: 7}}, context);
        expect(reasoner.config.maxDerivationDepth).toBe(7);
    });
});
