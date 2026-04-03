import {jest} from '@jest/globals';
import {Metacognition, IntrospectionEvents} from '@senars/nar';
import {EventBus} from '@senars/core/src/util/EventBus.js';

describe('Metacognition', () => {
    let eventBus, metacognition, nar;

    beforeEach(() => {
        eventBus = new EventBus();
        nar = {
            input: jest.fn(),
            config: {get: jest.fn()},
            logInfo: jest.fn(),
        };
    });

    test('should load analyzers specified in the config', () => {
        metacognition = new Metacognition({
            analyzers: ['PerformanceAnalyzer'],
            PerformanceAnalyzer: {avgCycleTimeThreshold: 50},
        }, eventBus, nar);

        expect(metacognition.analyzers).toHaveLength(1);
        expect(metacognition.analyzers[0].config.avgCycleTimeThreshold).toBe(50);
    });

    test('should handle events and trigger analyzers', () => {
        metacognition = new Metacognition({analyzers: ['PerformanceAnalyzer']}, eventBus, nar);
        metacognition.start();

        const analyzeSpy = jest.spyOn(metacognition.analyzers[0], 'analyze');
        eventBus.emit(IntrospectionEvents.CYCLE_START, {timestamp: Date.now()});

        expect(analyzeSpy).toHaveBeenCalled();
    });

    test('should process findings and input them into NAR', () => {
        metacognition = new Metacognition({
            analyzers: ['PerformanceAnalyzer'],
            PerformanceAnalyzer: {avgCycleTimeThreshold: 10},
        }, eventBus, nar);
        metacognition.start();

        const processFindingsSpy = jest.spyOn(metacognition, 'processFindings');
        eventBus.emit(IntrospectionEvents.CYCLE_START, {timestamp: Date.now()});
        eventBus.emit(IntrospectionEvents.CYCLE_END, {timestamp: Date.now() + 20});

        expect(processFindingsSpy).toHaveBeenCalled();
        expect(nar.input).toHaveBeenCalledWith('<(SELF, has_property, high_cycle_time) --> TRUE>.');
    });
});
