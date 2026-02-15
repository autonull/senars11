/**
 * @file tests/integration/core/test-nar.integration.test.js
 * @description Integration tests for NAR using real objects and services
 */

// Third-party imports
// (none in this file)

// Local imports
import { Truth } from '../../../src/Truth.js';
import { NAR } from '../../../src/nar/NAR.js';

// Test helper imports
// (none in this file - would be added if we used test helpers)

// Default test configuration that passes validation
const DEFAULT_NAR_CONFIG = {
    debug: { enabled: false },
    cycle: {
        delay: 1,
        maxTasksPerCycle: 5,
        ruleApplicationLimit: 50
    },
    memory: {
        capacity: 1000,
        consolidationThreshold: 0.1,
        forgettingThreshold: 0.05,
        conceptActivationDecay: 0.95,
        focusSetSize: 100
    },
    focus: {
        size: 100,
        setCount: 3,
        attentionDecay: 0.98,
        diversityFactor: 0.3
    },
    taskManager: {
        defaultPriority: 0.5,
        priorityThreshold: 0.1,
        priority: {
            confidenceMultiplier: 0.3,
            goalBoost: 0.2,
            questionBoost: 0.1
        }
    },
    performance: {
        useOptimizedCycle: true,
        enableProfiling: false,
        maxExecutionTime: 100
    },
    ruleEngine: {
        enableValidation: true,
        maxRuleApplicationsPerCycle: 20,
        performanceTracking: true
    }
};

describe('NAR Integration Tests with Real Services', () => {
    let nar;

    beforeEach(async () => {
        nar = new NAR(DEFAULT_NAR_CONFIG);
        await nar.initialize();
    });

    afterEach(async () => {
        if (nar?.isRunning) nar.stop();
        await nar?.dispose();
    });

    test('should process simple belief input and store in memory', async () => {
        const inputResult = await nar.input('(cat --> animal).');
        expect(inputResult).toBe(true);

        const concepts = nar.getConcepts();
        expect(concepts).toHaveLength(1);

        const catConcept = concepts.find(c => c.term.toString().includes('cat'));
        expect(catConcept?.term.toString()).toContain('cat');
    });

    test('should handle compound terms with real object processing', async () => {
        await nar.input('(&, cat, animal, pet).');
        const concepts = nar.getConcepts();
        const compoundConcept = concepts.find(c => c.term.toString().includes('&'));

        expect(!!compoundConcept).toBe(true);
        expect(await nar.step()).toBeDefined();
    });

    test('should create concepts and store tasks with real memory service', async () => {
        const inputs = ['(dog --> animal).', '(bird --> animal).', '(fish --> animal).'];
        for (const input of inputs) await nar.input(input);

        const concepts = nar.getConcepts();
        expect(concepts.length).toBeGreaterThanOrEqual(3);
        concepts.forEach(c => expect(c.term).toBeDefined());

        expect(nar.getBeliefs().length).toBeGreaterThanOrEqual(1);
    });

    test('should handle truth value operations with real Truth objects', async () => {
        await Promise.all([
            nar.input('(cat --> animal). %0.8;0.9%'),
            nar.input('(dog --> animal). %0.7;0.85%')
        ]);

        await nar.step();
        const catBelief = nar.getBeliefs().find(b => b.term.toString().includes('cat'));

        expect(catBelief?.truth).toBeInstanceOf(Truth);
        expect(catBelief?.truth?.frequency).toBeCloseTo(0.8, 1);
        expect(catBelief?.truth?.confidence).toBeCloseTo(0.9, 1);
    });

    test('should provide system statistics from real components', async () => {
        await Promise.all([
            nar.input('(apple --> fruit).'),
            nar.input('(orange --> fruit).')
        ]);

        await nar.step();
        const stats = nar.getStats();

        expect(stats).toMatchObject({
            memoryStats: expect.any(Object),
            taskManagerStats: expect.any(Object),
            streamReasonerStats: expect.any(Object)
        });

        expect(stats.memoryStats.totalConcepts).toBeGreaterThanOrEqual(1);
        expect(stats.isRunning).toBe(false);
    });

    test('should handle complex reasoning cycles with real components', async () => {
        nar.start();
        await Promise.all([
            nar.input('(bird --> flyer). %0.9;0.8%'),
            nar.input('(bird --> animal). %0.95;0.85%')
        ]);

        const results = await nar.runCycles(3);
        expect(results).toHaveLength(3);

        nar.stop();
        expect(nar.getConcepts().length).toBeGreaterThanOrEqual(1);
    });

    test('should support querying with real memory and concept retrieval', async () => {
        await Promise.all([
            nar.input('(canary --> bird).'),
            nar.input('(bird --> flyer).')
        ]);

        await nar.step();
        const concepts = nar.getConcepts();
        const [canaryConcept, birdConcept] = [
            concepts.find(c => c.term.toString().includes('canary')),
            concepts.find(c => c.term.toString().includes('bird'))
        ];

        expect([
            canaryConcept?.term.toString()?.includes('canary'),
            birdConcept?.term.toString()?.includes('bird')
        ]).toEqual([true, true]);
    });

    test('should maintain component integration during reset operations', async () => {
        await nar.input('(test --> concept).');
        const initialCount = nar.getConcepts().length;
        expect(initialCount).toBeGreaterThan(0);

        nar.reset();
        expect(nar.getConcepts().length).toBe(0);

        await nar.input('(reset_test --> working).');
        expect(nar.getConcepts().length).toBe(1);
    });

    test('should handle derivation processing with real stream reasoner', async () => {
        await Promise.all([
            nar.input('(A --> B).'),
            nar.input('(B --> C).')
        ]);

        // Execute multiple steps to allow derivation processing
        const stepResults = [];
        for (let i = 0; i < 5; i++) {
            stepResults.push(await nar.step());
        }

        expect(stepResults.every(r => r !== undefined)).toBe(true);
        expect(nar.getBeliefs().length).toBeGreaterThanOrEqual(2);
        expect(nar.getStats().streamReasonerStats).not.toBeNull();
    });
});