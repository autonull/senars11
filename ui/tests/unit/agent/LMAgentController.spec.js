
import { jest } from '@jest/globals';

// Polyfill for TransformStream needed by ollama-ai-provider
if (typeof TransformStream === 'undefined') {
    global.TransformStream = class TransformStream {};
}

import { LMAgentController } from '../../../src/agent/LMAgentController.js';

// Mocks
const mockLogger = {
    log: jest.fn()
};

const mockAIClient = {
    generate: jest.fn(),
    stream: jest.fn(),
    modelInstances: new Map(),
    destroy: jest.fn()
};

const mockToolsBridge = {
    initialize: jest.fn(),
    getToolDescriptions: jest.fn(() => [{ name: 'test_tool', description: 'A test tool', parameters: {} }]),
    executeTool: jest.fn(),
    hasTool: jest.fn()
};

describe('LMAgentController', () => {
    let controller;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new LMAgentController(mockLogger);
        // Override _createAIClient to return our mock
        controller._createAIClient = jest.fn(() => mockAIClient);
    });

    it('should parse and execute tool calls from LM response', async () => {
        // Setup
        // We call initialize to set up the client (which uses our mocked _createAIClient)
        await controller.initialize();

        // Inject mock tools bridge (since initialize creates a real one otherwise)
        controller.toolsBridge = mockToolsBridge;

        const userMessage = "Run the test tool";
        const toolCallJson = {
            tool: "test_tool",
            parameters: { arg: "val" }
        };
        const assistantResponse = `Sure, I'll run that.\n\`\`\`json\n${JSON.stringify(toolCallJson)}\n\`\`\``;

        mockAIClient.generate.mockResolvedValue({ text: assistantResponse });
        mockToolsBridge.executeTool.mockResolvedValue({ success: true, result: "Tool ran" });

        // Act
        const response = await controller.chat(userMessage);

        // Assert
        expect(response).toBe(assistantResponse);
        expect(mockToolsBridge.executeTool).toHaveBeenCalledWith("test_tool", { arg: "val" });

        // Verify history update
        const history = controller.conversationHistory;
        expect(history).toHaveLength(3); // User, Assistant, Tool Result
        expect(history[2].role).toBe('system');
        expect(history[2].content).toContain("Tool 'test_tool' execution result");
    });

    it('should handle multiple tool calls', async () => {
        // Setup
        await controller.initialize();
        controller.toolsBridge = mockToolsBridge;

        const assistantResponse = `
        First call:
        \`\`\`json
        { "tool": "tool1", "parameters": {} }
        \`\`\`
        Second call:
        \`\`\`json
        { "tool": "tool2", "parameters": {} }
        \`\`\`
        `;

        mockAIClient.generate.mockResolvedValue({ text: assistantResponse });
        mockToolsBridge.executeTool.mockResolvedValue({ success: true });

        // Act
        await controller.chat("Run two tools");

        // Assert
        expect(mockToolsBridge.executeTool).toHaveBeenCalledTimes(2);
        expect(mockToolsBridge.executeTool).toHaveBeenCalledWith("tool1", {});
        expect(mockToolsBridge.executeTool).toHaveBeenCalledWith("tool2", {});
    });

    it('should ignore invalid json blocks', async () => {
         // Setup
         await controller.initialize();
         controller.toolsBridge = mockToolsBridge;

         const assistantResponse = `
         Invalid call:
         \`\`\`json
         { "tool": "broken", "parameters":
         \`\`\`
         `;

         mockAIClient.generate.mockResolvedValue({ text: assistantResponse });

         // Act
         await controller.chat("Run broken tool");

         // Assert
         expect(mockToolsBridge.executeTool).not.toHaveBeenCalled();
         // History should only have user and assistant
         expect(controller.conversationHistory).toHaveLength(2);
    });
});
