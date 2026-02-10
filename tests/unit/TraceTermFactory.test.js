import {TermFactory} from '../../src/term/TermFactory.js';

describe('Trace TermFactory Process', () => {
    test('trace the creation of equality term', () => {
        const factory = new TermFactory();

        const fiveTerm = factory.atomic('5');
        const anotherFiveTerm = factory.atomic('5');

        const data = {operator: '=', components: [fiveTerm, anotherFiveTerm]};
        const {operator, components} = factory._normalizeTermData(data);

        const normalizedComponents = factory._canonicalizeComponents(operator, components);

        const name = factory._buildCanonicalName(operator, normalizedComponents);

        const term = factory._createAndCache(operator, normalizedComponents, name);
    });
});