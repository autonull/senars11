/**
 * Phase 4 Core Components Integration Test
 * Tests the core functionality implemented during Phase 4 including:
 * - TermFactory with proper hash-based identity
 * - Term with proper ID calculation
 * - Task creation with validation
 * - Memory with configuration validation
 * - Focus component integration
 * - NAR with Focus integration
 * - TermFactory validation
 */

import {TermFactory} from '../../src/term/TermFactory.js';
import {Task} from '../../src/task/Task.js';
import {Memory} from '../../src/memory/Memory.js';
import {Focus} from '../../src/memory/Focus.js';
import {NAR} from '../../src/nar/NAR.js';
import {Truth} from '../../src/Truth.js';

describe('Phase 4 Core Components Integration', () => {
    let termFactory;

    beforeEach(() => {
        termFactory = new TermFactory();
    });

    test('TermFactory should handle proper hash-based identity with commutativity', () => {
        const term1 = termFactory.conjunction('A', 'B');
        const term2 = termFactory.conjunction('B', 'A'); // Should be same due to commutativity

        expect(term1.toString()).toBeDefined();
        expect(term2.toString()).toBeDefined();
        expect(term1.equals(term2)).toBe(true);
        expect(term1.id).toBe(term2.id);
    });

    test('Term should have proper ID calculation for atomic terms', () => {
        const atomicTerm = termFactory.atomic('test');

        expect(atomicTerm.toString()).toBe('test');
        expect(atomicTerm.id).toBe('test');
        expect(atomicTerm.isAtomic).toBe(true);
    });

    test('Task should be created with proper validation', () => {
        const testTerm = termFactory.atomic('dog');
        const testTruth = new Truth(0.9, 0.8);
        const testTask = new Task({term: testTerm, punctuation: '.', truth: testTruth, budget: {priority: 0.8}});

        expect(testTask).toBeDefined();
        expect(testTask.term).toBe(testTerm);
        expect(testTask.type).toBe('BELIEF');
        expect(testTask.truth).toBe(testTruth);
        expect(testTask.budget.priority).toBe(0.8);
        expect(testTask.toString()).toContain('dog.');
    });

    test('Memory should handle proper configuration and task operations', () => {
        const testTerm = termFactory.atomic('dog');
        const testTruth = new Truth(0.9, 0.8);
        const testTask = new Task({term: testTerm, punctuation: '.', truth: testTruth, budget: {priority: 0.8}});

        const memory = new Memory({priorityThreshold: 0.5});

        // Test successful creation
        expect(memory).toBeDefined();

        // Test adding task to memory
        const added = memory.addTask(testTask);
        expect(added).toBe(true);

        // Test getting concept
        const concept = memory.getConcept(testTerm);
        expect(concept).toBeDefined();
        expect(concept.term).toBe(testTerm);
    });

    test('Focus component should integrate properly', () => {
        const focus = new Focus({defaultFocusSetSize: 10});

        expect(focus).toBeDefined();
        expect(focus._config.defaultFocusSetSize).toBe(10);
        expect(focus.getCurrentFocus()).toBe('default');
    });

    test('NAR should integrate with Focus component properly', async () => {
        const nar = new NAR();

        expect(nar).toBeDefined();
        expect(nar._focus).toBeDefined();
        expect(nar._focus).toBeInstanceOf(Focus);

        await nar.dispose();
    });

    test('TermFactory should handle validation and compound terms correctly', () => {
        // Test atomic term creation
        const validTerm = termFactory.atomic('simple');
        expect(validTerm).toBeDefined();
        expect(validTerm.toString()).toBe('simple');

        // Test compound term creation
        const compoundTerm = termFactory.inheritance('cat', 'animal');
        expect(compoundTerm).toBeDefined();
        expect(compoundTerm.toString()).toBeDefined(); // Should have a string representation
        expect(compoundTerm.isCompound).toBe(true);

        // Test commutativity handling
        const commuteTerm = termFactory.conjunction('X', 'Y');
        const commuteTerm2 = termFactory.conjunction('Y', 'X');
        expect(commuteTerm.equals(commuteTerm2)).toBe(true);
    });

    test('Integration of all core components should work together', () => {
        // Create terms
        const subjectTerm = termFactory.atomic('dog');
        const predicateTerm = termFactory.atomic('animal');
        const inheritanceTerm = termFactory.inheritance(subjectTerm, predicateTerm);

        // Create task
        const task = new Task({
            term: inheritanceTerm,
            punctuation: '.',
            truth: new Truth(0.9, 0.8),
            budget: {priority: 0.7}
        });

        // Create memory and add task
        const memory = new Memory({priorityThreshold: 0.5});
        const added = memory.addTask(task);
        expect(added).toBe(true);

        // Verify concept was created
        const concept = memory.getConcept(inheritanceTerm);
        expect(concept).toBeDefined();
        expect(concept.term).toBe(inheritanceTerm);

        // Verify through focus as well
        const focus = new Focus({defaultFocusSetSize: 5});
        const wasAddedToFocus = focus.addTaskToFocus(task);
        expect(wasAddedToFocus).toBe(true);
    });
});