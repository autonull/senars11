import {MetaController, NeuroSymbolicBridge} from '../../src/index.js';
import {strict as assert} from 'assert';
import {describe, test} from '@jest/globals';
import {MeTTaInterpreter} from '@senars/metta/src/MeTTaInterpreter.js';

describe('MeTTa Self-Optimization', () => {

    test('MetaController should optimize hyperparameters using MeTTa', async () => {
        const mettaInterpreter = new MeTTaInterpreter();

        const controller = new MetaController({
            useMettaRepresentation: true,
            mettaInterpreter,
            mettaConfig: {ground: mettaInterpreter.ground},
            explorationRate: 0.5
        });

        // Use a minimal bridge
        controller.bridge = new NeuroSymbolicBridge({
            mettaInterpreter,
            useSeNARS: false,
            gradientTracking: false,
            cacheInference: false
        });
        await controller.bridge.initialize();

        // Simulate metrics: low success rate -> should increase exploration
        controller.metrics.set('modificationsApplied', 10);
        controller.metrics.set('modificationsSuccessful', 1); // 10% success rate < 20% threshold

        await controller.optimizeHyperparameters();

        assert.ok(controller.config.explorationRate > 0.5, 'Should increase exploration rate');
        console.log('Optimized exploration rate:', controller.config.explorationRate);
    });

    test('MetaController should decrease exploration when success is high', async () => {
        const mettaInterpreter = new MeTTaInterpreter();
        const controller = new MetaController({
            useMettaRepresentation: true,
            mettaInterpreter,
            mettaConfig: {ground: mettaInterpreter.ground},
            explorationRate: 0.5
        });

        controller.bridge = new NeuroSymbolicBridge({
            mettaInterpreter,
            useSeNARS: false,
            gradientTracking: false,
            cacheInference: false
        });
        await controller.bridge.initialize();

        // Simulate metrics: high success rate -> should decrease exploration
        controller.metrics.set('modificationsApplied', 10);
        controller.metrics.set('modificationsSuccessful', 9); // 90% success rate > 80% threshold

        console.log('Before optimize - explorationRate:', controller.config.explorationRate);
        console.log('Applied:', controller.metrics.get('modificationsApplied'));
        console.log('Successful:', controller.metrics.get('modificationsSuccessful'));

        await controller.optimizeHyperparameters();

        console.log('After optimize - explorationRate:', controller.config.explorationRate);

        assert.ok(controller.config.explorationRate < 0.5, 'Should decrease exploration rate');
        console.log('Optimized exploration rate:', controller.config.explorationRate);
    });

});
