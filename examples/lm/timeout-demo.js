/**
 * Timeout Demo - Model Load Timeout Protection
 *
 * This example demonstrates how to configure and handle model loading timeouts
 * to prevent indefinite hangs during initialization.
 */

import {LM} from '../../core/src/lm/LM.js';
import {EventBus, TransformersJSProvider} from '@senars/core';

async function main() {
    console.log('='.repeat(60));
    console.log('Model Load Timeout Demo');
    console.log('='.repeat(60));

    const eventBus = new EventBus();

    // Track model loading events
    eventBus.on('lm:model-load-start', (data) => {
        console.log('\n[EVENT] Model load started');
        console.log(`  Model: ${data.modelName}`);
        console.log(`  Task: ${data.task}`);
        console.log(`  Time: ${new Date(data.timestamp).toISOString()}`);
    });

    eventBus.on('lm:model-load-complete', (data) => {
        console.log('\n[EVENT] Model loaded successfully ✅');
        console.log(`  Model: ${data.modelName}`);
        console.log(`  Elapsed: ${(data.elapsedMs / 1000).toFixed(2)}s`);
    });

    eventBus.on('lm:model-load-timeout', (data) => {
        console.log('\n[EVENT] Model load timeout ⏱️');
        console.log(`  Model: ${data.modelName}`);
        console.log(`  Timeout: ${data.timeoutMs}ms`);
        console.log(`  Elapsed: ${data.elapsedMs}ms`);
    });

    eventBus.on('lm:debug', (data) => {
        console.log(`[DEBUG] ${data.message}`, data);
    });

    // Example 1: Normal timeout (should succeed for small models)
    console.log('\n--- Example 1: Normal Timeout (60s) ---');
    try {
        const provider1 = new TransformersJSProvider({
            modelName: 'Xenova/LaMini-Flan-T5-248M',
            loadTimeout: 60000, // 60 seconds
            eventBus,
            debug: true
        });

        console.log('\nInitializing model with 60s timeout...');
        const lm1 = new LM({}, eventBus);
        lm1.registerProvider('transformers', provider1);

        const result = await lm1.generateText('Hello! How are you?');
        console.log('\n✅ Inference successful!');
        console.log(`Response: ${result}`);
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }

    // Example 2: Very short timeout (will likely timeout on first load)
    console.log('\n\n--- Example 2: Short Timeout (2s) - Demonstrating Timeout ---');
    try {
        const provider2 = new TransformersJSProvider({
            modelName: 'Xenova/LaMini-Flan-T5-248M',
            loadTimeout: 2000, // 2 seconds (very short, will likely timeout)
            eventBus,
            debug: false
        });

        console.log('\nInitializing model with 2s timeout (will likely timeout)...');
        const lm2 = new LM({}, eventBus);
        lm2.registerProvider('transformers-short', provider2);

        await lm2.generateText('This will timeout', {}, 'transformers-short');
        console.log('✅ Completed (cached model)');
    } catch (error) {
        console.error('\n❌ Expected timeout error:', error.message);
        console.log('\nℹ️  This is expected on first run when model needs to download.');
        console.log('   Subsequent runs will use cached model and may succeed.');
    }

    // Example 3: Custom timeout configuration
    console.log('\n\n--- Example 3: Custom Timeout Configuration ---');
    console.log('\nConfiguration options:');
    console.log('  loadTimeout: 60000  // Default: 60 seconds');
    console.log('  loadTimeout: 0      // Disable timeout (not recommended)');
    console.log('  loadTimeout: 120000 // Extended: 120 seconds for large models');

    console.log('\n='.repeat(60));
    console.log('Timeout Demo Complete');
    console.log('='.repeat(60));
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
