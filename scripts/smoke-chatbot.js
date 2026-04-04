#!/usr/bin/env node
import { AIClient } from '../agent/src/ai/AIClient.js';

async function testWithContext() {
    console.log('=== ChatBot with RECALL + HISTORY Context ===\n');

    const ai = new AIClient({
        provider: 'transformers',
        modelName: 'onnx-community/Qwen2.5-0.5B-Instruct',
        temperature: 0.7,
        maxTokens: 256
    });

    // Simulate the full prompt structure from _handleQuestion with structured context
    const systemPrompt = `You are SeNARchy, a helpful assistant.
Be CONCISE and DIRECT. Answer in 1-2 sentences max (under 300 characters).
Personality: helpful, knowledgeable, and concise.`;

    // Simulate having some recalled memories (from SemanticMemory) + history
    const recalledMemories = [
        '[conversation] ##metta sseehh "SeNARchy: what\'s 2+2?" "4" (relevance: 0.82)',
    ];
    const history = 'sseehh: hi SeNARchy\nSeNARchy: Hello sseehh!';
    const question = "SeNARchy: what's 2+2?";

    const contextStr = [
        'RECALL:\n' + recalledMemories.join('\n'),
        'HISTORY:\n' + history
    ].join('\n\n');

    const userPrompt = `${contextStr}\n\nQuestion: ${question}`;

    console.log('System prompt:', JSON.stringify(systemPrompt));
    console.log('User prompt:', JSON.stringify(userPrompt));
    console.log('');

    const result = await ai.generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ]);

    const text = result.text?.trim() || '';
    console.log('Response:', JSON.stringify(text));

    const ok = text && !text.includes('object Object') && !text.includes('system:') && text.length < 300;
    console.log(ok ? 'PASS\n' : 'FAIL\n');
    return ok;
}

async function testWithoutMemories() {
    console.log('=== ChatBot without RECALL (first conversation) ===\n');

    const ai = new AIClient({
        provider: 'transformers',
        modelName: 'onnx-community/Qwen2.5-0.5B-Instruct',
        temperature: 0.7,
        maxTokens: 256
    });

    const systemPrompt = `You are SeNARchy, a helpful assistant.
Be CONCISE and DIRECT. Answer in 1-2 sentences max (under 300 characters).
Personality: helpful, knowledgeable, and concise.`;

    const history = '';
    const question = "what's the capital of France?";

    const contextStr = history ? 'HISTORY:\n' + history : '';
    const userPrompt = `${contextStr}${contextStr ? '\n\n' : ''}Question: ${question}`;

    console.log('User prompt:', JSON.stringify(userPrompt));

    const result = await ai.generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ]);

    const text = result.text?.trim() || '';
    console.log('Response:', JSON.stringify(text));

    const ok = text && !text.includes('object Object') && !text.includes('system:') && text.length < 300;
    console.log(ok ? 'PASS\n' : 'FAIL\n');
    return ok;
}

async function main() {
    const r1 = await testWithContext();
    const r2 = await testWithoutMemories();

    const allOk = r1 && r2;
    console.log(allOk ? 'All tests passed.' : 'Some tests failed.');
    process.exit(allOk ? 0 : 1);
}

main();
