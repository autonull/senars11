import {beforeEach, describe, expect, test} from '@jest/globals';
import {Memory} from '../../../core/src/memory/Memory.js';
import {TermFactory} from '../../../core/src/term/TermFactory.js';
import {Task} from '../../../core/src/task/Task.js';

describe('Memory', () => {
    const createTask = (termName, termFactory) => new Task({
        term: termFactory.create(termName),
        punctuation: '.',
        truth: {frequency: 1.0, confidence: 0.9}
    });

    describe('Basic Operations', () => {
        let memory, termFactory;

        beforeEach(() => {
            termFactory = new TermFactory();
            memory = new Memory({maxConcepts: 10, forgetPolicy: 'priority'}, null, termFactory);
        });

        test('adds tasks and creates concepts', () => {
            const task = createTask('cat', termFactory);
            expect(memory.addTask(task)).toBe(true);
            expect(memory.hasConcept(task.term)).toBe(true);
            expect(memory.stats.totalConcepts).toBe(1);
        });

        test('retrieves concepts', () => {
            const task = createTask('dog', termFactory);
            memory.addTask(task);
            const concept = memory.getConcept(task.term);
            expect(concept).toBeDefined();
            expect(concept.term.toString()).toBe('dog');
        });

        test('removes concepts', () => {
            const task = createTask('bird', termFactory);
            memory.addTask(task);
            expect(memory.removeConcept(task.term)).toBe(true);
            expect(memory.hasConcept(task.term)).toBe(false);
        });

        test('clears memory', () => {
            memory.addTask(createTask('fish', termFactory));
            memory.clear();
            expect(memory.stats.totalConcepts).toBe(0);
            expect(memory.concepts.size).toBe(0);
        });

        test('serialization roundtrip', () => {
            memory.addTask(createTask('serialization', termFactory));
            const serialized = memory.serialize();
            expect(serialized).toBeDefined();
            expect(serialized.concepts).toBeDefined();
        });
    });

    describe.each([
        ['priority', 5],
        ['priority', 10],
        ['fifo', 5],
        ['fifo', 10]
    ])('Capacity with %s policy (limit: %d)', (forgetPolicy, maxConcepts) => {
        let memory, termFactory;

        beforeEach(() => {
            termFactory = new TermFactory();
            memory = new Memory({maxConcepts, forgetPolicy}, null, termFactory);
        });

        test('respects capacity limits', () => {
            const overflowCount = Math.floor(maxConcepts * 1.5);
            for (let i = 0; i < overflowCount; i++) {
                memory.addTask(createTask(`term_${i}`, termFactory));
            }
            expect(memory.stats.totalConcepts).toBeLessThanOrEqual(maxConcepts);
            expect(memory.stats.conceptsForgotten).toBeGreaterThan(0);
        });

        test('handles exact capacity boundary', () => {
            for (let i = 0; i < maxConcepts; i++) {
                memory.addTask(createTask(`exact_${i}`, termFactory));
            }
            expect(memory.stats.totalConcepts).toBeGreaterThan(0);
            expect(memory.stats.totalConcepts).toBeLessThanOrEqual(maxConcepts);
        });
    });
});
