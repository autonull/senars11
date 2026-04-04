#!/usr/bin/env node
import { AIClient } from '../agent/src/ai/AIClient.js';

// Simulates the exact call chain from the IRC chatbot:
// _handleMessage → messageProcessor.processMessage → _handleQuestion → this.agent.ai.generate([...])

async function simulateChatFlow() {
    console.log('=== Full ChatBot LM Chain Test ===\n');

    // This is exactly what the chatbot does:
    const ai = new AIClient({
        provider: 'transformers',
        modelName: 'onnx-community/Qwen2.5-0.5B-Instruct',
        temperature: 0.7,
        maxTokens: 256
    });
    console.log(`Provider: ${ai.defaultProvider}, Model: ${ai.defaultModel}\n`);

    // Scenario 1: "what's 2+2?" - exactly as _handleQuestion builds it
    console.log('--- Scenario: "what\'s 2+2?" (from _handleQuestion) ---');
    const questionMessages = [
        { role: 'system', content: 'You are SeNARchy, a helpful assistant.\nBe CONCISE and DIRECT. Answer in 1-2 sentences max (under 300 characters).\nPersonality: helpful, knowledgeable, and concise.' },
        { role: 'user', content: "Question: what's 2+2?" }
    ];
    console.log('Input messages:', JSON.stringify(questionMessages, null, 2));

    const qResult = await ai.generate(questionMessages);
    const qText = qResult.text?.trim() || '';
    console.log('Response:', JSON.stringify(qText));

    const qOk = qText && !qText.includes('object Object') && !qText.includes('system:') && !qText.includes('user:') && qText.length < 300;
    console.log(qOk ? 'PASS\n' : 'FAIL\n');

    // Scenario 2: greeting - exactly as _handleGreeting would call (but it doesn't, it uses canned)
    // Instead test _handleStatement which is used for non-question messages
    console.log('--- Scenario: greeting statement (from _handleStatement) ---');
    const statementMessages = [
        { role: 'system', content: 'You are SeNARchy, a helpful assistant.\nBe CONCISE and NATURAL. Respond in 1 sentence max (under 200 characters).\nPersonality: helpful, knowledgeable, and concise.' },
        { role: 'user', content: 'Context: \n\nMessage: hi there!' }
    ];
    console.log('Input messages:', JSON.stringify(statementMessages, null, 2));

    const sResult = await ai.generate(statementMessages);
    const sText = sResult.text?.trim() || '';
    console.log('Response:', JSON.stringify(sText));

    const sOk = sText && !sText.includes('object Object') && !sText.includes('system:') && !sText.includes('user:') && sText.length < 200;
    console.log(sOk ? 'PASS\n' : 'FAIL\n');

    // Scenario 3: conversation context - from _handleQuestion with history
    console.log('--- Scenario: "SeNARchy: what\'s 2+2?" with context ---');
    const ctxMessages = [
        { role: 'system', content: 'You are SeNARchy, a helpful assistant.\nBe CONCISE and DIRECT. Answer in 1-2 sentences max (under 300 characters).\nPersonality: helpful, knowledgeable, and concise.' },
        { role: 'user', content: 'Context: sseehh: hi SeNARchy\nSeNARchy: Hello sseehh!\n\nQuestion: SeNARchy: what\'s 2+2?' }
    ];
    console.log('Input messages:', JSON.stringify(ctxMessages, null, 2));

    const cResult = await ai.generate(ctxMessages);
    const cText = cResult.text?.trim() || '';
    console.log('Response:', JSON.stringify(cText));

    const cOk = cText && !cText.includes('object Object') && !cText.includes('system:') && !cText.includes('user:') && cText.length < 300;
    console.log(cOk ? 'PASS\n' : 'FAIL\n');

    const allOk = qOk && sOk && cOk;
    console.log(allOk ? 'All tests passed.' : 'Some tests failed.');
    process.exit(allOk ? 0 : 1);
}

simulateChatFlow();
