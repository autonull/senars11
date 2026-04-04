import {jest} from '@jest/globals';
import {Reasoner, Focus} from '@senars/nar';
import {Logger} from '@senars/core';
import {createTestMemory, createTestReasoner} from '../../support/baseTestUtils.js';

describe('Reasoner', () => {
    let reasoner;

    describe('Default (SimpleRunner)', () => {
        beforeEach(() => {
            reasoner = createTestReasoner({focus: new Focus(), memory: createTestMemory()});
        });

        test('config', () => {
            expect(reasoner.config).toMatchObject({
                maxDerivationDepth: 10,
                cpuThrottleInterval: 0,
                executionMode: 'simple'
            });
            expect(reasoner.isRunning).toBe(false);
        });

        test('metrics', () => {
            const metrics = reasoner.getMetrics();
            expect(metrics).toMatchObject({totalDerivations: expect.any(Number)});
            expect(metrics.mode).toBe('simple');
            expect(reasoner.getState()).toMatchObject({isRunning: false});
            expect(reasoner.getComponentStatus()).toHaveProperty('premiseSource');
            expect(reasoner.getDebugInfo()).toHaveProperty('state');
        });

        test('lifecycle', async () => {
            reasoner.start();
            expect(reasoner.isRunning).toBe(true);

            const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => {
            });
            reasoner.start();
            expect(warn).toHaveBeenCalledWith('Reasoner is already running');
            warn.mockRestore();

            expect(await reasoner.step(100)).toBeDefined();

            await reasoner.stop();
            expect(reasoner.isRunning).toBe(false);

            reasoner.start();
            await reasoner.cleanup();
            expect(reasoner.isRunning).toBe(false);
            expect(reasoner.getMetrics().totalDerivations).toBe(0);
        });
    });

    describe('PipelineRunner', () => {
        beforeEach(() => {
            reasoner = createTestReasoner({
                focus: new Focus(),
                memory: createTestMemory(),
                config: {executionMode: 'pipeline'}
            });
        });

        test('config', () => {
            expect(reasoner.config.executionMode).toBe('pipeline');
        });

        test('feedback', () => {
            const handler = jest.fn();
            reasoner.registerConsumerFeedbackHandler(handler);
            reasoner.notifyConsumption({id: 'test'}, 10, {consumerId: 'c1'});
            expect(handler).toHaveBeenCalledWith({id: 'test'}, 10, expect.objectContaining({consumerId: 'c1'}));

            reasoner.receiveConsumerFeedback({processingSpeed: 5, backlogSize: 20});

            // Access via controller
            expect(reasoner.runner.controller.outputConsumerSpeed).toBe(5);
            expect(reasoner.runner.controller.performance.backpressureLevel).toBe(20);
        });

        test('adaptive processing', () => {
            reasoner.runner.controller.performance.backpressureLevel = 25;
            const initial = reasoner.config.cpuThrottleInterval;

            // We need to await as it might be async
            return reasoner.runner.controller._adaptProcessingRate().then(() => {
                expect(reasoner.config.cpuThrottleInterval).toBeGreaterThanOrEqual(initial);
                reasoner.runner.controller._updatePerformanceMetrics();
                expect(reasoner.config.cpuThrottleInterval).toBeGreaterThanOrEqual(0);
                expect(reasoner.config.backpressureInterval).toBeGreaterThanOrEqual(1);
            });
        });
    });
});
