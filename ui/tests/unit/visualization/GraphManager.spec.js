import { jest } from '@jest/globals';

// Mock Config using ESM support
jest.unstable_mockModule('../../../src/config/Config.js', () => ({
    Config: {
        getGraphStyle: () => [],
        getGraphLayout: () => ({ name: 'grid' }),
        getConstants: () => ({})
    }
}));

// Mock ContextMenu
jest.unstable_mockModule('../../../src/components/ContextMenu.js', () => ({
    ContextMenu: class { destroy() {} }
}));

// Import module under test dynamically after mocking
const { GraphManager } = await import('../../../src/visualization/GraphManager.js');

// Mock Cytoscape
const mockCy = {
    add: jest.fn(),
    getElementById: jest.fn(),
    elements: jest.fn(),
    layout: jest.fn(() => ({ run: jest.fn() })),
    resize: jest.fn(),
    fit: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(),
    style: jest.fn(),
    nodes: jest.fn(() => []),
    animate: jest.fn().mockReturnThis()
};
mockCy.elements.mockReturnValue({ remove: jest.fn(), removeClass: jest.fn() });

global.cytoscape = jest.fn(() => mockCy);

describe('GraphManager', () => {
    let graphManager;
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'graph';
        document.body.appendChild(container);

        graphManager = new GraphManager({ graphContainer: container });
        graphManager.initialize();
        graphManager.setUpdatesEnabled(true);

        mockCy.add.mockClear();
        mockCy.getElementById.mockReset();
        mockCy.getElementById.mockReturnValue({ length: 0 }); // Default: node not found
        mockCy.animate.mockClear();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    test('should add a node when concept.created message is received', () => {
        const payload = { id: 'c1', term: 'bird', budget: { priority: 0.8 } };
        graphManager.updateFromMessage({ type: 'concept.created', payload });

        expect(mockCy.add).toHaveBeenCalledWith(expect.objectContaining({
            group: 'nodes',
            data: expect.objectContaining({
                id: 'c1',
                weight: 80
            })
        }));
    });

    test('should update an existing node when concept.updated message is received', async () => {
        // Setup: Mock that node exists
        const mockNode = {
            length: 1,
            data: jest.fn(),
            animate: jest.fn().mockReturnThis(),
            animation: jest.fn().mockReturnValue({
                play: jest.fn().mockReturnValue({
                    promise: jest.fn().mockResolvedValue()
                })
            })
        };
        mockCy.getElementById.mockReturnValue(mockNode);

        const payload = { id: 'c1', term: 'bird', budget: { priority: 0.9, durability: 0.5 } };
        graphManager.updateFromMessage({ type: 'concept.updated', payload });

        expect(mockCy.getElementById).toHaveBeenCalledWith('c1');
        expect(mockNode.data).toHaveBeenCalledWith(expect.objectContaining({
            weight: 90,
            fullData: payload
        }));

        // Wait for animation promise chain
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify animation (pulse)
        expect(mockNode.animation).toHaveBeenCalledTimes(2);
    });

    test('should add a node if concept.updated message is received for non-existent node', () => {
        mockCy.getElementById.mockReturnValue({ length: 0 });

        const payload = { id: 'c2', term: 'fish', budget: { priority: 0.5 } };
        graphManager.updateFromMessage({ type: 'concept.updated', payload });

        expect(mockCy.add).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                id: 'c2',
                weight: 50
            })
        }));
    });

    test('should dispatch senars:concept:select when a node is clicked', () => {
        // We need to simulate the tap event on cytoscape
        const eventCallback = mockCy.on.mock.calls.find(call => call[0] === 'tap' && call[1] === 'node')[2];

        const mockEvent = {
            target: {
                id: () => 'c1',
                data: (key) => {
                    if (key === 'fullData') return { id: 'c1', term: 'bird' };
                    if (key === 'label') return 'bird';
                    return null;
                }
            },
            originalEvent: {}
        };

        const dispatchSpy = jest.spyOn(document, 'dispatchEvent');

        eventCallback(mockEvent);

        expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
        const event = dispatchSpy.mock.calls[0][0];
        expect(event.type).toBe('senars:concept:select');
        expect(event.detail).toEqual({ concept: { id: 'c1', term: 'bird' }, id: 'c1' });
    });
});
