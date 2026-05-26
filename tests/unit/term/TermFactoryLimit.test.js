import {TermFactory} from '@senars/nar';

describe('TermFactory Limits', () => {
    let factory;

    beforeEach(() => {
        factory = new TermFactory();
        factory.atomic('A');
        factory.atomic('B');
        factory.atomic('C');
    });

    test('getMostComplexTerms handles limit=0', () => {
        const terms = factory.getMostComplexTerms(0);
        expect(terms).toEqual([]);
    });

    test('getMostComplexTerms handles negative limit', () => {
        const terms = factory.getMostComplexTerms(-1);
        expect(terms).toEqual([]);
    });

    test('getSimplestTerms handles limit=0', () => {
        const terms = factory.getSimplestTerms(0);
        expect(terms).toEqual([]);
    });

    test('getSimplestTerms handles negative limit', () => {
        const terms = factory.getSimplestTerms(-1);
        expect(terms).toEqual([]);
    });

    test('getMostComplexTerms works with limit > cache size', () => {
        const terms = factory.getMostComplexTerms(100);
        expect(terms.length).toBe(3);
    });

    test('getSimplestTerms works with limit > cache size', () => {
        const terms = factory.getSimplestTerms(100);
        expect(terms.length).toBe(3);
    });
});
