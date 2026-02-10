import {TaskMatch, TestNAR} from '../../../../core/src/testing/TestNAR.js';

describe('NAL Parity Tests (1-6)', () => {

    describe('NAL-2: Similarity and Analogy', () => {
        // NAL-2: Comparison
        // (M --> P), (M --> S) |- (S <-> P) (Similarity)
        test('Comparison: Derive Similarity from Shared Subject', async () => {
            const result = await new TestNAR()
                .input('<robin --> bird>', 0.9, 0.9)
                .input('<robin --> flyer>', 0.9, 0.9)
                .run(5)
                .expect(new TaskMatch('<bird <-> flyer>'))
                .execute();
            expect(result).toBe(true);
        });

        // NAL-2: Analogy
        // (S <-> P), (S --> M) |- (P --> M)
        test('Analogy: Deduce Property from Similarity', async () => {
            const result = await new TestNAR()
                .input('<robin <-> sparrow>', 0.9, 0.9)
                .input('<robin --> bird>', 0.9, 0.9)
                .run(5)
                .expect(new TaskMatch('<sparrow --> bird>'))
                .execute();
            expect(result).toBe(true);
        });
    });

    describe('NAL-3: Compound Terms', () => {
        // NAL-3: Intersection Composition
        // (S --> P), (S --> M) |- (S --> (P & M))
        test('Composition: Intersection from Properties', async () => {
            const result = await new TestNAR()
                .input('<tweety --> bird>', 0.9, 0.9)
                .input('<tweety --> yellow>', 0.9, 0.9)
                .run(5)
                .expect(new TaskMatch('<tweety --> (&, bird, yellow)>'))
                .execute();
            expect(result).toBe(true);
        });

        // NAL-3: Decomposition
        // (S --> (P & M)) |- (S --> P)
        test('Decomposition: Extract Property from Intersection', async () => {
            const result = await new TestNAR()
                .input('<tweety --> (&, bird, yellow)>', 0.9, 0.9)
                .run(5)
                .expect(new TaskMatch('<tweety --> bird>'))
                .execute();
            expect(result).toBe(true);
        });
    });

    describe('NAL-6: Variable Logic', () => {
        // NAL-6: Variable Unification in Syllogism
        // (cat --> ?x), (?x --> animal) |- (cat --> animal)
        // Here ?x should unify with a term if provided, or unify two variables.
        // But more commonly: (cat --> mammal), (?x --> mammal) ==> (?x --> animal)? No.

        // Let's test basic Variable Instantiation / Unification in Syllogism
        // Pattern: (cat --> ?x) and (?x --> animal) might be too abstract without binding.
        // Better: (cat --> mammal) and ((?x --> mammal) ==> (?x --> animal)) |- (cat --> animal)
        // This requires Modus Ponens with unification.
        test.skip('NAL-6: Modus Ponens with Variable Unification', async () => {
            const result = await new TestNAR()
                .input('((?x --> mammal) ==> (?x --> animal))', 0.9, 0.9)
                .input('<cat --> mammal>', 0.9, 0.9)
                .run(5)
                .expect(new TaskMatch('<cat --> animal>'))
                .execute();
            expect(result).toBe(true);
        });

        // NAL-6: Syllogism with Variable
        // (<cat --> ?x>) && (<?x --> animal>) ?
        // Typically NARS variables are used in implications.
        // Let's test standard syllogism where one term matches a variable?
        // Actually, NAL-6 usually implies the ability to handle variables in general inference.
        // If we have (<cat --> mammal>) and (<?x --> mammal> ==> <?x --> animal>), we expect (<cat --> animal>).
        // Which I just added above.

        // Another case: Syllogism (Chain)
        // (cat --> ?x) ?? No.
        // How about: (cat --> mammal) and (mammal --> ?y)? No.
    });
});
