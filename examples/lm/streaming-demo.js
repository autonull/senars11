#!/usr/bin/env node

import {TransformersJSProvider} from '@senars/core';

const countTokens = text => text.split(/\s+/).filter(t => t.length > 0).length;
const tokensPerSec = (tokens, ms) => ((tokens / ms) * 1000).toFixed(2);

async function main() {
    console.log('=== Streaming LM Demo ===\n');

    const provider = new TransformersJSProvider({
        modelName: 'Xenova/LaMini-Flan-T5-248M'
    });

    console.log('Initializing model...\n');

    const prompt = 'Explain what artificial intelligence is in simple terms.';
    console.log(`Prompt: "${prompt}"\n`);
    console.log('Streaming output:');
    console.log('─'.repeat(50));

    try {
        const startTime = Date.now();
        let firstTokenTime = null;
        let tokenCount = 0;
        let fullOutput = '';

        for await (const chunk of provider.streamText(prompt, {maxTokens: 100, temperature: 0.7})) {
            if (firstTokenTime === null) firstTokenTime = Date.now();

            process.stdout.write(chunk);
            fullOutput += chunk;
            tokenCount += countTokens(chunk);
        }

        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const ttft = firstTokenTime ? firstTokenTime - startTime : 0;

        console.log('\n' + '─'.repeat(50));
        console.log('\n📊 Metrics:');
        console.log(`  TTFT (Time To First Token): ${ttft}ms`);
        console.log(`  Total inference time: ${totalTime}ms`);
        console.log(`  Tokens generated: ~${tokenCount}`);
        console.log(`  Throughput: ~${tokensPerSec(tokenCount, totalTime)} tokens/sec`);

    } catch (error) {
        console.error('\nError during streaming:', error.message);
        await provider.destroy();
        process.exit(1);
    }

    console.log('\n✅ Streaming demo completed!');

    // Cleanup and exit
    await provider.destroy();
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
