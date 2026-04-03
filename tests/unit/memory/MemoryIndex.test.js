import {MemoryIndex, Concept} from '@senars/nar';
import {createConcept, tf} from './testUtils.js';

describe('MemoryIndex', () => {
    let index;
    const config = Concept.DEFAULT_CONFIG;

    beforeEach(() => {
        index = new MemoryIndex();
    });


    test('initialization', () => {
        expect(index.getStats()).toMatchObject({
            totalConcepts: 0, inheritanceEntries: 0, implicationEntries: 0, similarityEntries: 0
        });
    });

    describe('Concept Management', () => {
        test('atomic', () => {
            const term = tf.atomic('A');
            const concept = createConcept(term);
            index.addConcept(concept);

            expect(index.getStats().totalConcepts).toBe(1);
            expect(index.getConcept(term.id)).toBe(concept);
        });

        test('inheritance (-->)', () => {
            const [sub, pred] = [tf.atomic('dog'), tf.atomic('animal')];
            const concept = createConcept(tf.inheritance(sub, pred));
            index.addConcept(concept);

            expect(index.getStats()).toMatchObject({totalConcepts: 1, inheritanceEntries: 1});
            expect(index.findInheritanceConcepts(pred)).toContain(concept);
            expect(index.findConceptsByOperator('-->')).toHaveLength(1);
        });

        test('implication (==>)', () => {
            const [pre, post] = [tf.atomic('rain'), tf.atomic('wet')];
            const concept = createConcept(tf.implication(pre, post));
            index.addConcept(concept);

            expect(index.getStats()).toMatchObject({totalConcepts: 1, implicationEntries: 1});
            expect(index.findImplicationConcepts(pre)).toContain(concept);
        });

        test('similarity (<->)', () => {
            const [t1, t2] = [tf.atomic('dog'), tf.atomic('wolf')];
            const concept = createConcept(tf.similarity(t1, t2));
            index.addConcept(concept);

            expect(index.getStats()).toMatchObject({totalConcepts: 1, similarityEntries: 2}); // Bidirectional
            expect(index.findSimilarityConcepts(t1)).toContain(concept);
            expect(index.findSimilarityConcepts(t2)).toContain(concept);
        });

        test('complex compound', () => {
            const inner = tf.conjunction(tf.atomic('A'), tf.atomic('B'));
            const term = tf.inheritance(inner, tf.atomic('C'));
            const concept = createConcept(term);

            index.addConcept(concept);
            expect(index.getStats().operatorEntries).toBe(2); // & and -->
        });

        test('removal', () => {
            const term = tf.inheritance(tf.atomic('A'), tf.atomic('B'));
            const concept = createConcept(term);
            index.addConcept(concept);

            index.removeConcept(concept);
            expect(index.getStats().totalConcepts).toBe(0);
            expect(index.getConcept(term.id)).toBeUndefined();
        });

        test('clear', () => {
            index.addConcept(createConcept(tf.atomic('A')));
            index.clear();
            expect(index.getStats().totalConcepts).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        test('graceful handling', () => {
            expect(() => index.removeConcept(createConcept(tf.atomic('A')))).not.toThrow();
            expect(index.findInheritanceConcepts(tf.atomic('Z'))).toEqual([]);
        });

        test('duplicate terms', () => {
            const term = tf.inheritance(tf.atomic('A'), tf.atomic('B'));
            const [c1, c2] = [createConcept(term), createConcept(term)];

            index.addConcept(c1);
            index.addConcept(c2);
            expect(index.getStats().totalConcepts).toBe(2);
            expect(index.getConcept(term.id)).toBe(c2); // Last one wins lookup by ID

            index.removeConcept(c1);
            expect(index.getStats().totalConcepts).toBe(1);
        });
    });
});
