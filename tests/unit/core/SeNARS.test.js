import { jest } from '@jest/globals';

// Define mock factory
const mockNarInstance = {
    initialize: jest.fn().mockResolvedValue(),
    input: jest.fn().mockResolvedValue(),
    runCycles: jest.fn().mockResolvedValue(),
    getBeliefs: jest.fn().mockReturnValue([]),
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
    step: jest.fn().mockResolvedValue(),
    reset: jest.fn(),
    getStats: jest.fn().mockReturnValue({}),
    dispose: jest.fn().mockResolvedValue(),
    streamReasoner: {
        metrics: {
            recentDerivations: []
        }
    }
};

const MockNAR = jest.fn(() => mockNarInstance);

jest.unstable_mockModule('../../../core/src/nar/NAR.js', () => ({
    NAR: MockNAR
}));

// Dynamic imports must be after mockModule
const { SeNARS } = await import('../../../core/src/SeNARS.js');

describe('SeNARS', () => {
    let senars;

    beforeEach(() => {
        // Reset mocks
        MockNAR.mockClear();
        Object.values(mockNarInstance).forEach(fn => {
            if (fn.mockClear) fn.mockClear();
        });

        // Re-assign return values if needed
        mockNarInstance.getBeliefs.mockReturnValue([]);

        senars = new SeNARS();
    });

    test('initialization', async () => {
        await senars._initialize();
        expect(mockNarInstance.initialize).toHaveBeenCalled();
    });

    test('learn', async () => {
        const result = await senars.learn('(cats --> mammals).');
        expect(mockNarInstance.input).toHaveBeenCalledWith('(cats --> mammals).');
        expect(result).toBe(true);
    });

    test('ask', async () => {
        mockNarInstance.getBeliefs.mockReturnValue([
            { term: { toString: () => '(cats --> animals)' }, truth: { c: 0.9, f: 0.8 } }
        ]);

        const result = await senars.ask('(cats --> animals)?');

        expect(mockNarInstance.input).toHaveBeenCalledWith('(cats --> animals)?');
        expect(mockNarInstance.runCycles).toHaveBeenCalledWith(20); // Default cycles
        expect(result.answer).toBe(true);
        expect(result.confidence).toBe(0.9);
        expect(result.frequency).toBe(0.8);
    });

    test('ask with custom cycles', async () => {
        await senars.ask('(cats --> animals)?', { cycles: 50 });
        expect(mockNarInstance.runCycles).toHaveBeenCalledWith(50);
    });

    test('extractKeyTerms', () => {
        const terms = senars._extractKeyTerms('(cats --> mammals).');
        expect(terms).toEqual(['cats', 'mammals']);
    });

    test('lifecycle methods', async () => {
        await senars.start();
        expect(mockNarInstance.start).toHaveBeenCalled();

        await senars.step();
        expect(mockNarInstance.step).toHaveBeenCalled();

        senars.stop();
        expect(mockNarInstance.stop).toHaveBeenCalled();

        senars.reset();
        expect(mockNarInstance.reset).toHaveBeenCalled();

        await senars.dispose();
        expect(mockNarInstance.dispose).toHaveBeenCalled();
    });
});
