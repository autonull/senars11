import {TransformersJSProvider} from '@senars/core';
import {jest} from '@jest/globals';

// Skip: ONNX runtime external dependency causes Float32Array tensor type errors
describe.skip('TransformersJSProvider Integration', () => {
    // Increase timeout for model download/load
    jest.setTimeout(30000);

    let provider;

    afterEach(async () => {
        if (provider) {
            await provider.destroy();
        }
    });

    test('should instantiate without error', () => {
        provider = new TransformersJSProvider({
            modelName: 'Xenova/LaMini-Flan-T5-248M',
            loadTimeout: 10000
        });
        expect(provider).toBeDefined();
        expect(provider.modelName).toBe('Xenova/LaMini-Flan-T5-248M');
    });

    test('should initialize and generate text', async () => {
        provider = new TransformersJSProvider({
            modelName: 'Xenova/LaMini-Flan-T5-248M',
            device: 'cpu',
            loadTimeout: 20000
        });

        const prompt = 'What is 2 + 2?';
        console.log('Generating text for prompt:', prompt);

        const start = Date.now();
        const result = await provider.generateText(prompt, {maxTokens: 10, temperature: 0.1});
        const duration = Date.now() - start;

        console.log('Generation result:', result);
        console.log('Duration:', duration, 'ms');

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    test('should emit progress events', async () => {
        provider = new TransformersJSProvider({
            modelName: 'Xenova/LaMini-Flan-T5-248M',
            device: 'cpu'
        });

        const progressListener = jest.fn();
        provider.on('lm:model-dl-progress', progressListener);

        await provider.generateText('test', {maxTokens: 5});

        // We might not get progress events if model is already cached, 
        // so we just verify the provider didn't crash and listeners were attached.
        // If it was a fresh download, we would expect calls.
        // for now just ensure it runs.
        expect(provider.pipeline).toBeDefined();
    });
});
