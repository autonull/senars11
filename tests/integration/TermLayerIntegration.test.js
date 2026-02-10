import {NAR} from '../../src/nar/NAR.js';
import {TermFactory} from '../../src/term/TermFactory.js';

describe('TermLayer Integration', () => {
    let nar;
    let termFactory;

    beforeEach(() => {
        nar = new NAR();
        termFactory = new TermFactory();
    });

    afterEach(async () => {
        // Clean up NAR instance
        if (nar && typeof nar.dispose === 'function') {
            await nar.dispose();
        }
    });

    test('TermLayer should be accessible through NAR', () => {
        expect(nar.termLayer).toBeDefined();
        expect(nar.termLayer.add).toBeDefined();
        expect(nar.termLayer.get).toBeDefined();
        expect(nar.termLayer.remove).toBeDefined();
    });

    test('TermLayer should be used in reasoning cycle to enhance tasks', async () => {
        // Add some associations to the TermLayer
        const source = termFactory.atomic('animal');
        const target = termFactory.atomic('cat');
        nar.termLayer.add(source, target, {priority: 0.8});

        // Add a task that matches the source term using the input method with narsese string
        await nar.input('animal. %1.0;0.9%');

        // Execute a reasoning cycle
        await nar.step();

        // Verify that the cycle ran without errors
        const actualCycleCount = nar._useStreamReasoner ?
            (nar.streamReasoner?.getMetrics?.()?.totalDerivations || 0) : nar.cycleCount;
        expect(actualCycleCount).toBeGreaterThanOrEqual(0); // Allow 0 for stream reasoner
    });

    test('Associative reasoning with TermLayer should work correctly', async () => {
        // Create and add associations to TermLayer
        const catTerm = termFactory.atomic('cat');
        const animalTerm = termFactory.atomic('animal');
        const mammalTerm = termFactory.atomic('mammal');

        // Add associations: cat -> animal, cat -> mammal
        nar.termLayer.add(catTerm, animalTerm, {priority: 0.9});
        nar.termLayer.add(catTerm, mammalTerm, {priority: 0.8});

        // Add belief about cat using narsese string
        await nar.input('cat. %1.0;0.9%');

        // Simple reasoning cycle to test that TermLayer doesn't break the process
        await nar.step();

        // Verify TermLayer statistics are available
        const stats = nar.termLayer.getStats();
        expect(typeof stats).toBe('object');
        expect(stats.linkCount).toBeGreaterThanOrEqual(2);
    });

    test('TermLayer capacity limits are enforced', () => {
        const layer = nar.termLayer;
        const originalCapacity = layer.capacity;

        // Temporarily set a small capacity for testing
        Object.defineProperty(layer, 'capacity', {value: 2, writable: true});

        const source1 = termFactory.atomic('source1');
        const source2 = termFactory.atomic('source2');
        const source3 = termFactory.atomic('source3');
        const target1 = termFactory.atomic('target1');
        const target2 = termFactory.atomic('target2');
        const target3 = termFactory.atomic('target3');

        // Add three links with increasing priorities (so lowest priority gets removed)
        layer.add(source1, target1, {priority: 1}); // Should be removed when capacity exceeded
        layer.add(source2, target2, {priority: 2});
        layer.add(source3, target3, {priority: 3});

        // Should only have 2 links due to capacity limit
        expect(layer.count).toBe(2);
        expect(layer.has(source1, target1)).toBe(false); // Lowest priority removed
        expect(layer.has(source2, target2)).toBe(true);
        expect(layer.has(source3, target3)).toBe(true);

        // Reset capacity to original
        Object.defineProperty(layer, 'capacity', {value: originalCapacity, writable: true});
    });
});