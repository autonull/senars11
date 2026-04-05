import {Focus, TaskBagPremiseSource} from '@senars/nar';
import {createTestTask} from '../../support/index.js';

describe('TaskBagPremiseSource', () => {
    let focus, premiseSource;
    const tasks = [
        createTestTask('task1', 'BELIEF', 0.9, 0.9, 0.9),
        createTestTask('task2', 'BELIEF', 0.7, 0.8, 0.7),
        createTestTask('goal', 'GOAL'),
        createTestTask('question', 'QUESTION')
    ];

    beforeEach(() => {
        focus = new Focus();
        tasks.forEach(t => focus.addTaskToFocus(t));
    });

    test('config', () => {
        const ps = new TaskBagPremiseSource(focus);
        expect(ps.samplingObjectives.priority).toBe(true);
        expect(ps.weights.priority).toBe(1.0);

        const custom = new TaskBagPremiseSource(focus, {
            priority: false, recency: true,
            weights: {priority: 0.5, recency: 1.5}
        });
        expect(custom.samplingObjectives).toMatchObject({priority: false, recency: true});
        expect(custom.weights).toMatchObject({priority: 0.5, recency: 1.5});
    });

    test('selection methods', () => {
        const ps = new TaskBagPremiseSource(focus, {
            targetTime: Date.now(),
            weights: {priority: 0.25, recency: 0.25, punctuation: 0.25, novelty: 0.25}
        });

        expect(['priority', 'recency', 'punctuation', 'novelty']).toContain(ps._selectSamplingMethod());
        expect(ps._sampleByPriority()).toBeDefined();
        expect(ps._sampleByRecency()).toBeDefined();
        expect(ps._sampleByPunctuation()).toBeDefined();
        expect(ps._sampleByNovelty()).toBeDefined();
    });

    test('dynamic adaptation', () => {
        premiseSource = new TaskBagPremiseSource(focus, {
            dynamic: true,
            weights: {priority: 1.0, recency: 0.5, punctuation: 0.2, novelty: 0.1}
        });

        premiseSource.recordMethodEffectiveness('priority', 0.9);
        premiseSource.recordMethodEffectiveness('recency', 0.7);
        premiseSource.recordMethodEffectiveness('punctuation', 0.3);
        premiseSource.recordMethodEffectiveness('novelty', 0.8);

        const initial = {...premiseSource.weights};

        // Force update eligibility
        premiseSource.lastUpdate = Date.now() - 2000;
        premiseSource._updateWeightsDynamically();

        expect(premiseSource.weights.priority).toBeCloseTo(0.9 * initial.priority + 0.1 * 0.9);
        expect(premiseSource.weights.recency).toBeCloseTo(0.9 * initial.recency + 0.1 * 0.7);
        expect(premiseSource.weights.novelty).toBeCloseTo(0.9 * initial.novelty + 0.1 * 0.8);

        // Update frequency check
        premiseSource.lastUpdate = Date.now();
        const current = {...premiseSource.weights};
        premiseSource._updateWeightsDynamically();
        expect(premiseSource.weights).toEqual(current);
    });

    test('method selection with updated weights', () => {
        premiseSource = new TaskBagPremiseSource(focus, {dynamic: true});
        premiseSource.weights = {priority: 0.0, recency: 1.0, punctuation: 0.0, novelty: 0.0};
        expect(premiseSource._selectSamplingMethod()).toBe('recency');
    });

    test('bag size', () => {
        expect(new TaskBagPremiseSource(focus)._getBagSize()).toBeGreaterThan(0);
    });
});
