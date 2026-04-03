import {Reasoner, TermFactory, Unifier} from '@senars/nar';
import {MeTTaInterpreter} from '@senars/metta/src/MeTTaInterpreter.js';
import {SeNARSBridge} from '@senars/metta/src/SeNARSBridge.js';


describe('MeTTa-Reason Integration', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    test('Unifier supports MeTTa variables', () => {
        const unifier = new Unifier(termFactory);
        const structure = termFactory.create('Struct', [termFactory.atomic('$x')]);
        const instance = termFactory.create('Struct', [termFactory.atomic('A')]);

        const result = unifier.unify(structure, instance);

        expect(result.success).toBe(true);
        expect(result.substitution['$x']).toBeDefined();
        expect(result.substitution['$x'].name).toBe('A');
    });

    // This test is more of a unit test for the adapter logic before full integration
    test('MeTTaRuleAdapter applies rule', async () => {
        const interpreter = new MeTTaInterpreter({termFactory});

        // Define rule: (=> (Human $x) (Mortal $x))
        const p1 = termFactory.variable('$x');
        const condition = termFactory.create('Human', [p1]);
        const conclusion = termFactory.create('Mortal', [p1]);
        const ruleTerm = termFactory.create('=>', [condition, conclusion]);

        // Since we are mocking the module import in MeTTaRuleAdapter for this test run in Node uncompiled,
        // we might hit issues with dynamic imports. 
        // However, let's try to verify the logic if possible.

        // For this test environment, we rely on the implementation we just wrote.
        // We know MeTTaRuleAdapter uses Unifier internally.

        // We need to properly import the class we just wrote
        const {MeTTaRuleAdapter} = await import('@senars/metta/src/helpers/MeTTaRuleAdapter.js');

        const adapter = new MeTTaRuleAdapter(ruleTerm, interpreter);

        // Input: (Human Socrates)
        const socrates = termFactory.atomic('Socrates');
        const premiseTerm = termFactory.create('Human', [socrates]);

        const primaryPremise = {
            term: premiseTerm,
            stamp: {id: 1, depth: 1}
        };

        const results = await adapter.applyAsync(primaryPremise, null, {});

        expect(results).toHaveLength(1);
        const resultTerm = results[0].term;
        expect(resultTerm.operator).toBe('Mortal');
        expect(resultTerm.components[0].name).toBe('Socrates');
    });
});
