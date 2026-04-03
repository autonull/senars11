import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { Server } from '../../agent/src/mcp/Server.js';

describe('Phase 5.1: Distributed Minimalism Verification (MCP)', () => {
    let mockNAR;
    let server;

    beforeEach(() => {
        mockNAR = {
            input: jest.fn(),
            runCycles: jest.fn().mockResolvedValue([]),
            query: jest.fn().mockReturnValue([]),
            reconcile: jest.fn().mockResolvedValue(true),
            memory: {
                getBeliefDeltas: jest.fn().mockReturnValue([
                    { term: 'A', truth: { frequency: 1.0, confidence: 0.9 } }
                ])
            },
            focus: {
                getTasks: jest.fn().mockReturnValue([])
            }
        };

        server = new Server({ nar: mockNAR, safety: {} });
    });

    test('MCP Server registers required tools', () => {
        const tools = server.server.tools;
        expect(tools.has('sync-beliefs')).toBe(true);
        expect(tools.has('reason')).toBe(true);
        expect(tools.has('memory-query')).toBe(true);
    });

    describe('sync-beliefs tool', () => {
        test('Processes incoming belief deltas and returns outgoing deltas', async () => {
            const syncTool = server.server.tools.get('sync-beliefs');

            const incoming = [
                { term: 'B', truth: { frequency: 0.8, confidence: 0.8 } }
            ];

            const result = await syncTool({ since: 0, incoming });

            expect(mockNAR.reconcile).toHaveBeenCalledWith(incoming[0]);
            expect(mockNAR.memory.getBeliefDeltas).toHaveBeenCalled();

            const content = JSON.parse(result.content[0].text);
            expect(content.status).toBe('success');
            expect(content.stats.reconciled).toBe(1);
            expect(content.deltas.length).toBe(1);
            expect(content.deltas[0].term).toBe('A');
        });

        test('Handles empty incoming beliefs', async () => {
            const syncTool = server.server.tools.get('sync-beliefs');
            const result = await syncTool({ since: 0 });

            expect(mockNAR.reconcile).not.toHaveBeenCalled();
            const content = JSON.parse(result.content[0].text);
            expect(content.stats.reconciled).toBe(0);
        });
    });

    describe('reason tool', () => {
        test('Inputs premises and runs reasoning cycles', async () => {
            const reasonTool = server.server.tools.get('reason');

            const premises = ['(robin --> bird).'];
            const goal = '(robin --> ?x)?';

            await reasonTool({ premises, goal });

            expect(mockNAR.input).toHaveBeenCalledWith(premises[0]);
            expect(mockNAR.input).toHaveBeenCalledWith(goal);
            expect(mockNAR.runCycles).toHaveBeenCalled();
        });
    });
});
