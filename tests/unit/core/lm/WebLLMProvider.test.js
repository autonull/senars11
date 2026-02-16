import {jest} from '@jest/globals';
import {WebLLMProvider} from '../../../../core/src/lm/WebLLMProvider.js';

// Mock dynamic import of @mlc-ai/web-llm
jest.unstable_mockModule('@mlc-ai/web-llm', () => ({
    CreateMLCEngine: jest.fn()
}));

describe('WebLLMProvider', () => {
    let provider;
    let mockCreateMLCEngine;
    let mockEngine;

    beforeEach(async () => {
        const mlc = await import('@mlc-ai/web-llm');
        mockCreateMLCEngine = mlc.CreateMLCEngine;

        mockEngine = {
            chat: {
                completions: {
                    create: jest.fn()
                }
            },
            unload: jest.fn()
        };
        mockCreateMLCEngine.mockResolvedValue(mockEngine);

        provider = new WebLLMProvider({
            modelName: 'test-model'
        });
    });

    afterEach(async () => {
        await provider.destroy();
        jest.clearAllMocks();
    });

    test('should initialize and load model', async () => {
        const prompt = 'Hello';
        mockEngine.chat.completions.create.mockResolvedValue({
            choices: [{message: {content: 'World'}}]
        });

        const result = await provider.generateText(prompt);

        expect(mockCreateMLCEngine).toHaveBeenCalledWith('test-model', expect.any(Object));
        expect(result).toBe('World');
    });

    test('should generate text with tools', async () => {
        const prompt = 'What time is it?';
        const toolCalls = [{
            id: 'call_1',
            type: 'function',
            function: {
                name: 'get_time',
                arguments: '{}'
            }
        }];

        mockEngine.chat.completions.create.mockResolvedValue({
            choices: [{
                message: {
                    content: 'I need to check the time.',
                    tool_calls: toolCalls
                },
                finish_reason: 'tool_calls'
            }],
            usage: {total_tokens: 10}
        });

        const result = await provider.generate(prompt, {
            tools: [{type: 'function', function: {name: 'get_time'}}]
        });

        expect(mockEngine.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({
            messages: [{role: 'user', content: prompt}],
            tools: expect.arrayContaining([expect.objectContaining({function: {name: 'get_time'}})])
        }));

        expect(result.text).toBe('I need to check the time.');
        expect(result.toolCalls).toEqual(toolCalls);
        expect(result.finishReason).toBe('tool_calls');
    });

    test('should stream text', async () => {
        const prompt = 'Hello';
        const chunks = [
            {choices: [{delta: {content: 'Hel'}}]},
            {choices: [{delta: {content: 'lo'}}]}
        ];

        // Mock async generator
        async function* chunkGenerator() {
            for (const chunk of chunks) {
                yield chunk;
            }
        }

        mockEngine.chat.completions.create.mockResolvedValue(chunkGenerator());

        const stream = provider.streamText(prompt);
        const results = [];
        for await (const chunk of stream) {
            results.push(chunk);
        }

        expect(results).toEqual(['Hel', 'lo']);
    });
});
