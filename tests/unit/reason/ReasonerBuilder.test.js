import {ReasonerBuilder} from '../../../core/src/reason/ReasonerBuilder.js';
import {TaskBagPremiseSource} from '../../../core/src/reason/TaskBagPremiseSource.js';
import {Strategy} from '../../../core/src/reason/Strategy.js';
import {RuleProcessor} from '../../../core/src/reason/RuleProcessor.js';
import {Focus} from '../../../core/src/memory/Focus.js';
import {TermFactory} from '../../../core/src/term/TermFactory.js';
import {createTestMemory} from '../../support/baseTestUtils.js';

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
