#!/usr/bin/env node
import {TransformersJSProvider} from '@senars/core';

const main = async () => {
    console.log('=== Minimal LM Inference ===\n');
    const provider = new TransformersJSProvider({
        modelName: 'Xenova/LaMini-Flan-T5-248M',
        loadTimeout: 120000 // Allow slow download
    });

    try {
        console.log(`Loading ${provider.config.modelName}...`);
        const start = Date.now();
        const result = await provider.generateText('Summarize: The cat sat on the mat.', {
            maxTokens: 50,
            temperature: 0.1
        });
        console.log(`Result: "${result}" (${Date.now() - start}ms)`);
    } catch (e) {
        console.error('Inference failed:', e.message);
        process.exit(1);
    } finally {
        await provider.destroy();
        process.exit(0);
    }
};

main();
