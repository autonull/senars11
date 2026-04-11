import {jest} from '@jest/globals';

// Mock McpServer before importing Server
// Note: unstable_mockModule is needed for ESM mocking in Jest
jest.unstable_mockModule("@modelcontextprotocol/sdk/server/mcp.js", () => {
    return {
        McpServer: jest.fn().mockImplementation(() => {
            const tools = new Map();
            return {
                tool: (name, schema, handler) => {
                    tools.set(name, handler);
                },
                connect: jest.fn(),
                close: jest.fn(),
                // Helper for test verification
                _getTool: (name) => tools.get(name)
            };
        })
    };
});

describe('MCP Server Integration', () => {
    let ServerClass;
    let mockNar;
    let serverInstance;
    let mcpServerMock;

    beforeEach(async () => {
        // Dynamic import to ensure mock is applied
        const module = await import('../../../agent/src/mcp/Server.js');
        ServerClass = module.Server;

        mockNar = {
            input: jest.fn().mockResolvedValue(true),
            runCycles: jest.fn().mockResolvedValue([
                [{
                    term: {toString: () => '(test --> result)'},
                    truth: {frequency: 0.9, confidence: 0.8},
                    punctuation: '.'
                }]
            ]),
            query: jest.fn().mockReturnValue([
                {
                    term: {toString: () => '(concept --> known)'},
                    truth: {frequency: 1.0, confidence: 0.9},
                    punctuation: '.'
                }
            ]),
            executeTool: jest.fn().mockResolvedValue({success: true, result: 'tool output'}),
            focus: {
                getTasks: jest.fn().mockReturnValue([])
            }
        };

        serverInstance = new ServerClass({nar: mockNar, safety: {piiDetection: false}});
        mcpServerMock = serverInstance.server;
    });

    test('should register required tools', () => {
        const getTool = mcpServerMock._getTool;
        expect(getTool('ping')).toBeDefined();
        expect(getTool('reason')).toBeDefined();
        expect(getTool('memory-query')).toBeDefined();
        expect(getTool('execute-tool')).toBeDefined();
        expect(getTool('get-focus')).toBeDefined();
    });

    test('reason tool should process input and return report', async () => {
        const reasonHandler = mcpServerMock._getTool('reason');

        const input = {premises: ['(a --> b).'], goal: '(b --> ?)?'};
        const result = await reasonHandler(input);

        expect(mockNar.input).toHaveBeenCalledWith('(a --> b).');
        expect(mockNar.input).toHaveBeenCalledWith('(b --> ?)?');
        expect(mockNar.runCycles).toHaveBeenCalled();

        expect(result.content[0].text).toContain('SeNARS Reasoning Trace');
        expect(result.content[0].text).toContain('(test --> result)');
    });

    test('memory-query tool should query NAR', async () => {
        const queryHandler = mcpServerMock._getTool('memory-query');

        const input = {query: 'concept', limit: 5};
        const result = await queryHandler(input);

        expect(mockNar.query).toHaveBeenCalledWith('concept');
        expect(result.content[0].text).toContain('Memory Query');
        expect(result.content[0].text).toContain('(concept --> known)');
    });

    test('execute-tool should invoke NAR tool execution', async () => {
        const execHandler = mcpServerMock._getTool('execute-tool');

        const input = {toolName: 'calculator', parameters: {op: 'add'}};
        const result = await execHandler(input);

        expect(mockNar.executeTool).toHaveBeenCalledWith('calculator', {op: 'add'});
        expect(result.content[0].text).toContain('Tool Execution: calculator');
    });
});
