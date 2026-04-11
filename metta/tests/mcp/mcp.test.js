/**
 * MCP Integration Unit Tests
 * Tests for McpClientManager, MeTTaMCPManager, and utilities
 */

import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals';

// Mock the MCP SDK using unstable_mockModule for ES modules
const mockMcpClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    callTool: jest.fn().mockResolvedValue({content: [{type: 'text', text: 'result'}]}),
    listTools: jest.fn().mockResolvedValue({tools: [{name: 'test_tool', description: 'Test tool'}]}),
    close: jest.fn().mockResolvedValue(undefined)
};

const mockStdioTransport = {
    onclose: null,
    onerror: null,
    close: jest.fn().mockResolvedValue(undefined)
};

const mockSseTransport = {
    onclose: null,
    onerror: null,
    close: jest.fn().mockResolvedValue(undefined)
};

jest.unstable_mockModule('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: jest.fn().mockImplementation(() => mockMcpClient)
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: jest.fn().mockImplementation(() => mockStdioTransport)
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/client/sse.js', () => ({
    SSEClientTransport: jest.fn().mockImplementation(() => mockSseTransport)
}));

// Import after mocks
const {McpClientManager} = await import('../../src/mcp/McpClientManager.js');
const {MeTTaMCPManager} = await import('../../src/mcp/index.js');
const mcpUtils = await import('../../src/mcp/utils.js');

// Mock MeTTaInterpreter
const createMockInterpreter = () => ({
    load: jest.fn(),
    run: jest.fn(),
    query: jest.fn().mockReturnValue([]),
    space: {
        add: jest.fn(),
        addRule: jest.fn()
    }
});

describe('McpClientManager', () => {
    let manager;

    beforeEach(() => {
        manager = new McpClientManager({timeout: 5000});
    });

    afterEach(async () => {
        await manager.disconnectAll();
    });

    describe('constructor', () => {
        it('should create instance with default options', () => {
            const m = new McpClientManager();
            expect(m.opts.timeout).toBe(30000);
            expect(m.opts.maxRetries).toBe(3);
        });

        it('should create instance with custom options', () => {
            const m = new McpClientManager({timeout: 10000, maxRetries: 5});
            expect(m.opts.timeout).toBe(10000);
            expect(m.opts.maxRetries).toBe(5);
        });

        it('should extend EventEmitter', () => {
            expect(manager.on).toBeDefined();
            expect(manager.emit).toBeDefined();
        });
    });

    describe('connect', () => {
        it('should connect to stdio server', async () => {
            await manager.connect('test', 'node', ['server.js'], 'stdio');
            expect(manager.isConnected('test')).toBe(true);
        });

        it('should emit connected event', async () => {
            const handler = jest.fn();
            manager.on('connected', handler);
            await manager.connect('test', 'node', ['server.js']);
            expect(handler).toHaveBeenCalledWith({key: 'test', transport: 'stdio'});
        });

        it('should return existing connection if already connected', async () => {
            const first = await manager.connect('test', 'node', ['server.js']);
            const second = await manager.connect('test', 'node', ['server.js']);
            expect(first).toBe(second);
        });

        it('should emit error on connection failure', async () => {
            const handler = jest.fn();
            manager.on('error', handler);
            manager.clients.set('test', null);
            try {
                await manager.connect('test', 'invalid-command-that-does-not-exist', []);
            } catch (e) {
                expect(handler).toHaveBeenCalled();
            }
        });
    });

    describe('isConnected', () => {
        it('should return false for unknown server', () => {
            expect(manager.isConnected('unknown')).toBe(false);
        });

        it('should return true after connection', async () => {
            await manager.connect('test', 'node', ['server.js']);
            expect(manager.isConnected('test')).toBe(true);
        });
    });

    describe('getConnectedServers', () => {
        it('should return empty array initially', () => {
            expect(manager.getConnectedServers()).toEqual([]);
        });

        it('should return connected servers', async () => {
            await manager.connect('server1', 'node', ['server.js']);
            await manager.connect('server2', 'node', ['server2.js']);
            expect(manager.getConnectedServers()).toEqual(['server1', 'server2']);
        });
    });

    describe('getStatus', () => {
        it('should return null for unknown server', () => {
            expect(manager.getStatus('unknown')).toBe(null);
        });

        it('should return status after connection', async () => {
            await manager.connect('test', 'node', ['server.js']);
            const status = manager.getStatus('test');
            expect(status.connected).toBe(true);
            expect(status.transport).toBe('stdio');
        });
    });

    describe('callTool', () => {
        it('should throw if client not found', async () => {
            await expect(manager.callTool('unknown', 'tool')).rejects.toThrow('MCP Client not found');
        });

        it('should call tool and return result', async () => {
            await manager.connect('test', 'node', ['server.js']);
            const result = await manager.callTool('test', 'test_tool', {param: 'value'});
            expect(result.content).toBeDefined();
        });

        it('should emit tool-called event', async () => {
            const handler = jest.fn();
            manager.on('tool-called', handler);
            await manager.connect('test', 'node', ['server.js']);
            await manager.callTool('test', 'test_tool');
            expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                key: 'test',
                toolName: 'test_tool'
            }));
        });

        it('should retry on failure', async () => {
            const mgr = new McpClientManager({timeout: 5000, retryDelay: 10});
            await mgr.connect('test', 'node', ['server.js']);
            const client = mgr.clients.get('test');
            client.callTool.mockRejectedValueOnce(new Error('Temporary error'));
            client.callTool.mockResolvedValueOnce({content: [{type: 'text', text: 'success'}]});

            const result = await mgr.callTool('test', 'test_tool', {}, 1);
            expect(result.content).toBeDefined();
            await mgr.disconnectAll();
        });
    });

    describe('listTools', () => {
        it('should throw if client not found', async () => {
            await expect(manager.listTools('unknown')).rejects.toThrow('MCP Client not found');
        });

        it('should return tools list', async () => {
            await manager.connect('test', 'node', ['server.js']);
            const tools = await manager.listTools('test');
            expect(tools.tools).toBeDefined();
            expect(tools.tools.length).toBe(1);
        });

        it('should cache tools in status', async () => {
            await manager.connect('test', 'node', ['server.js']);
            await manager.listTools('test');
            const cached = manager.getCachedTools('test');
            expect(cached).toBeDefined();
            expect(cached.length).toBe(1);
        });
    });

    describe('disconnect', () => {
        it('should disconnect from server', async () => {
            await manager.connect('test', 'node', ['server.js']);
            await manager.disconnect('test');
            expect(manager.isConnected('test')).toBe(false);
        });

        it('should emit disconnected event', async () => {
            const handler = jest.fn();
            manager.on('disconnected', handler);
            await manager.connect('test', 'node', ['server.js']);
            await manager.disconnect('test');
            expect(handler).toHaveBeenCalledWith({key: 'test'});
        });
    });

    describe('getStats', () => {
        it('should return statistics', async () => {
            await manager.connect('test', 'node', ['server.js']);
            const stats = manager.getStats();
            expect(stats.connectedClients).toBe(1);
            expect(stats.servers).toContain('test');
        });
    });
});

describe('MeTTaMCPManager', () => {
    let mcpManager;
    let mockInterpreter;

    beforeEach(() => {
        mockInterpreter = createMockInterpreter();
        mcpManager = new MeTTaMCPManager(mockInterpreter);
    });

    afterEach(async () => {
        await mcpManager.disconnect();
    });

    describe('constructor', () => {
        it('should create manager and inject into global', () => {
            expect(globalThis.mcpClientManager).toBeDefined();
            expect(mcpManager.getManager()).toBe(globalThis.mcpClientManager);
        });

        it('should load mcp-std.metta into interpreter', () => {
            expect(mockInterpreter.load).toHaveBeenCalled();
        });

        it('should set up event forwarding', () => {
            expect(mcpManager.on).toBeDefined();
        });
    });

    describe('connect', () => {
        it('should connect and trigger discovery', async () => {
            await mcpManager.connect('test', 'node', ['server.js']);
            expect(mcpManager.isConnected('test')).toBe(true);
            expect(mockInterpreter.run).toHaveBeenCalledWith('!(mcp-discover "test")');
        });
    });

    describe('isConnected', () => {
        it('should delegate to manager', async () => {
            await mcpManager.connect('test', 'node', ['server.js']);
            expect(mcpManager.isConnected('test')).toBe(true);
        });
    });

    describe('getConnectedServers', () => {
        it('should return connected servers', async () => {
            await mcpManager.connect('test', 'node', ['server.js']);
            expect(mcpManager.getConnectedServers()).toContain('test');
        });
    });

    describe('event forwarding', () => {
        it('should forward connected event to space', async () => {
            await mcpManager.connect('test', 'node', ['server.js']);
            expect(mockInterpreter.space.add).toHaveBeenCalledWith(
                expect.objectContaining({name: 'mcp-connected'})
            );
        });
    });
});

describe('MCP Utils', () => {
    describe('withRetry', () => {
        it('should return result on first success', async () => {
            const fn = mcpUtils.withRetry(async (x) => x * 2);
            const result = await fn(5);
            expect(result).toBe(10);
        });

        it('should retry on failure', async () => {
            let attempts = 0;
            const fn = mcpUtils.withRetry(async () => {
                attempts++;
                if (attempts < 3) throw new Error('Fail');
                return 'success';
            }, {maxRetries: 3, baseDelay: 10});
            const result = await fn();
            expect(result).toBe('success');
            expect(attempts).toBe(3);
        });

        it('should throw after max retries', async () => {
            const fn = mcpUtils.withRetry(async () => {
                throw new Error('Always fails');
            }, {maxRetries: 2, baseDelay: 10});
            await expect(fn()).rejects.toThrow('Failed after 3 attempts');
        });
    });

    describe('withTimeout', () => {
        it('should return result if completes in time', async () => {
            const fn = mcpUtils.withTimeout(async (x) => x, 1000);
            const result = await fn(42);
            expect(result).toBe(42);
        });

        it('should throw on timeout', async () => {
            const fn = mcpUtils.withTimeout(async () => {
                await new Promise(r => setTimeout(r, 2000));
                return 'too slow';
            }, 100);
            await expect(fn()).rejects.toThrow('Timeout');
        });
    });

    describe('withCache', () => {
        it('should cache results', async () => {
            let calls = 0;
            const fn = mcpUtils.withCache(async (x) => {
                calls++;
                return x * 2;
            }, {ttlMs: 1000});

            await fn(5);
            await fn(5);
            expect(calls).toBe(1);
        });

        it('should expire cache after TTL', async () => {
            let calls = 0;
            const fn = mcpUtils.withCache(async (x) => {
                calls++;
                return x;
            }, {ttlMs: 50});

            await fn(1);
            await new Promise(r => setTimeout(r, 60));
            await fn(1);
            expect(calls).toBe(2);
        });
    });

    describe('pipeline', () => {
        it('should compose functions', async () => {
            const double = async (x) => x * 2;
            const addTen = async (x) => x + 10;
            const fn = mcpUtils.pipeline(double, addTen);
            const result = await fn(5);
            expect(result).toBe(20);
        });
    });

    describe('parallel', () => {
        it('should run functions in parallel', async () => {
            const fn1 = async (ctx) => ctx + 1;
            const fn2 = async (ctx) => ctx * 2;
            const fn = mcpUtils.parallel(fn1, fn2);
            const results = await fn(5);
            expect(results).toEqual([6, 10]);
        });
    });

    describe('withCircuitBreaker', () => {
        it('should open after failures', async () => {
            const fn = mcpUtils.withCircuitBreaker(async () => {
                throw new Error('Fail');
            }, {failureThreshold: 2, timeout: 100});

            await expect(fn()).rejects.toThrow('Fail');
            await expect(fn()).rejects.toThrow('Fail');
            await expect(fn()).rejects.toThrow('Circuit breaker is open');
        });

        it('should close after timeout', async () => {
            let callCount = 0;
            const fn = mcpUtils.withCircuitBreaker(async () => {
                callCount++;
                if (callCount === 1) throw new Error('Initial failure');
                return 'success';
            }, {
                failureThreshold: 1,
                timeout: 50
            });

            // First call fails
            await expect(fn()).rejects.toThrow('Initial failure');
            // Second call should be blocked by circuit breaker
            await expect(fn()).rejects.toThrow('Circuit breaker is open');

            // Wait for timeout
            await new Promise(r => setTimeout(r, 60));
            const result = await fn();
            expect(result).toBe('success');
        });
    });

    describe('rateLimit', () => {
        it('should limit call rate', async () => {
            let calls = 0;
            const fn = mcpUtils.rateLimit(async () => calls++, 2, 100);

            await Promise.all([fn(), fn(), fn(), fn()]);
            expect(calls).toBe(4);
        });
    });

    describe('fallbackChain', () => {
        it('should use first successful function', async () => {
            const fn1 = async () => {
                throw new Error('Fail');
            };
            const fn2 = async () => 'success';
            const fn3 = async () => 'never called';

            const fn = mcpUtils.fallbackChain(fn1, fn2, fn3);
            const result = await fn();
            expect(result).toBe('success');
        });

        it('should throw if all fail', async () => {
            const fn1 = async () => {
                throw new Error('Fail 1');
            };
            const fn2 = async () => {
                throw new Error('Fail 2');
            };

            const fn = mcpUtils.fallbackChain(fn1, fn2);
            await expect(fn()).rejects.toThrow('Fail 2');
        });
    });

    describe('ToolContext', () => {
        it('should maintain state', () => {
            const ctx = new mcpUtils.ToolContext();
            ctx.set('key', 'value');
            expect(ctx.get('key')).toBe('value');
        });

        it('should record history', () => {
            const ctx = new mcpUtils.ToolContext();
            ctx.record('tool1', {input: 1}, {output: 2});
            const history = ctx.getHistory();
            expect(history.length).toBe(1);
            expect(history[0].tool).toBe('tool1');
        });

        it('should clear state', () => {
            const ctx = new mcpUtils.ToolContext({initial: 'value'});
            ctx.clear();
            expect(ctx.get('initial')).toBeUndefined();
        });
    });
});
