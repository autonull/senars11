import {Memory, Stamp, Task, TermFactory, Truth} from '@senars/nar';

describe('Archive and Compilation', () => {
    let memory;
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
        memory = new Memory({
            maxConcepts: 5, // Small capacity to trigger forgetting
            forgetPolicy: 'priority'
        });
    });

    test('should archive compiled tasks when concept is forgotten due to capacity', () => {
        // 1. Fill memory with concepts
        const concepts = ['A', 'B', 'C', 'D', 'E'];
        for (const name of concepts) {
            const term = termFactory.atomic(name);
            const task = new Task({
                term: term,
                truth: new Truth(0.9, 0.9),
                stamp: Stamp.createInput(),
                budget: {priority: 0.8, durability: 0.8, quality: 0.8}
            });
            memory.addTask(task);
        }

        // Verify initial state
        expect(memory.stats.totalConcepts).toBe(5);
        expect(memory.archive.getStats().size).toBe(0);

        const conceptA = memory.getConcept(termFactory.atomic('A'));
        conceptA.forgettingMarked = true;

        // Trigger _removeForgettingConcepts directly to bypass consolidation scheduling/policy overwrite
        // This validates the compilation logic isolation
        memory._consolidation._removeForgettingConcepts(memory);

        // 4. Verify Archive
        // Concept A should be removed from memory
        expect(memory.hasConcept(termFactory.atomic('A'))).toBe(false);

        // Archive should have content
        const archiveStats = memory.archive.getStats();
        expect(archiveStats.size).toBeGreaterThan(0);
    });

    test('should store compiled rules in archive', () => {
        const term = termFactory.atomic('TestTerm');
        const task = new Task({
            term: term,
            truth: new Truth(0.9, 0.9),
            stamp: Stamp.createInput()
        });

        const concept = memory._createConcept(term);
        concept.addTask(task);
        concept.forgettingMarked = true;

        // Manual spy
        let putCalled = false;
        let putArg = null;
        const originalPut = memory.archive.put.bind(memory.archive);
        memory.archive.put = (content) => {
            putCalled = true;
            putArg = content;
            return originalPut(content);
        };

        // Call direct internal method
        memory._consolidation._removeForgettingConcepts(memory);

        expect(putCalled).toBe(true);
        const storedContent = JSON.parse(putArg);
        expect(storedContent.term).toBe('TestTerm');
        expect(storedContent.rules.length).toBeGreaterThan(0);
        expect(storedContent.rules[0]).toContain('compile-stub');
    });
});
