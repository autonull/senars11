
import { MetaController } from '../../src/meta/MetaController.js';
import { NeuroSymbolicBridge } from '../../src/bridges/NeuroSymbolicBridge.js';
import { strict as assert } from 'assert';
import { describe, test } from '@jest/globals';
import { MeTTaInterpreter } from '@senars/metta/src/MeTTaInterpreter.js';

describe('MeTTa Self-Optimization', () => {

    test('MetaController should optimize hyperparameters using MeTTa', async () => {
        const mettaInterpreter = new MeTTaInterpreter();

        const controller = new MetaController({
            useMettaRepresentation: true,
            mettaInterpreter,
            mettaConfig: { ground: mettaInterpreter.ground },
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
        controller.metrics.modificationsApplied = 10;
        controller.metrics.modificationsSuccessful = 1; // 10% success rate < 20% threshold

        await controller.optimizeHyperparameters();

        assert.ok(controller.config.explorationRate > 0.5, 'Should increase exploration rate');
        console.log('Optimized exploration rate:', controller.config.explorationRate);
    });

    test('MetaController should decrease exploration when success is high', async () => {
        const mettaInterpreter = new MeTTaInterpreter();
        const controller = new MetaController({
            useMettaRepresentation: true,
            mettaInterpreter,
            mettaConfig: { ground: mettaInterpreter.ground },
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
        controller.metrics.modificationsApplied = 10;
        controller.metrics.modificationsSuccessful = 9; // 90% success rate > 80% threshold

        await controller.optimizeHyperparameters();

        assert.ok(controller.config.explorationRate < 0.5, 'Should decrease exploration rate');
        console.log('Optimized exploration rate:', controller.config.explorationRate);
    });

});
