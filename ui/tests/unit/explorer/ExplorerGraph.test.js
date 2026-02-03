import { jest } from '@jest/globals';
import { ExplorerGraph } from '../../../src/explorer/ExplorerGraph.js';
import { BagBuffer } from '../../../src/data/BagBuffer.js';

// Mock Cytoscape
const mockCy = {
    add: jest.fn(),
    getElementById: jest.fn(),
    $id: jest.fn(),
    elements: jest.fn(),
    layout: jest.fn(() => ({ run: jest.fn() })),
    resize: jest.fn(),
    fit: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(),
    style: jest.fn(),
    nodes: jest.fn(() => {
        const arr = [];
        arr.style = jest.fn();
        arr.filter = jest.fn(() => ({ first: jest.fn() }));
        return arr;
    }),
    zoom: jest.fn(),
    pan: jest.fn(),
    extent: jest.fn(),
    batch: jest.fn((cb) => cb && cb()),
    autoungrabify: jest.fn(),
};
mockCy.elements.mockReturnValue({
    remove: jest.fn(),
    removeClass: jest.fn(),
    addClass: jest.fn()
});
mockCy.$id.mockReturnValue({
    empty: jest.fn(() => true),
    nonempty: jest.fn(() => false),
    data: jest.fn(),
    addClass: jest.fn(),
    removeClass: jest.fn(),
    animate: jest.fn(),
    style: jest.fn(), // Added style here too as it's used in _addNode/animate
});

global.cytoscape = jest.fn(() => mockCy);

describe('ExplorerGraph', () => {
    let container;
    let graph;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'graph-container';
        document.body.appendChild(container);

        graph = new ExplorerGraph('graph-container');
        // Mock viewport initialize to return true and set cy
        graph.viewport.initialize = jest.fn(() => {
            graph.viewport.cy = mockCy;
            return true;
        });

        graph.initialize();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    test('Initializes correctly', async () => {
        expect(graph.bag).toBeInstanceOf(BagBuffer);
        expect(graph.mappings.size).toBe('priority');
    });

    test('addConcept adds to BagBuffer', () => {
        graph.addConcept('test', 0.8, { type: 'concept' });
        expect(graph.bag.get('test')).toBeDefined();
        expect(graph.bag.get('test').priority).toBe(0.8);
    });

    test('findNode calls viewport.findNode', () => {
        graph.viewport.findNode = jest.fn();
        graph.findNode('test');
        expect(graph.viewport.findNode).toHaveBeenCalledWith('test');
    });

    test('highlightMatches calls viewport.highlightMatches', () => {
        graph.viewport.highlightMatches = jest.fn();
        graph.highlightMatches('test');
        expect(graph.viewport.highlightMatches).toHaveBeenCalledWith('test');
    });

    test('clear calls viewport.clear and bag.clear', () => {
        graph.viewport.clear = jest.fn();
        graph.bag.clear = jest.fn();

        graph.clear();

        expect(graph.viewport.clear).toHaveBeenCalled();
        expect(graph.bag.clear).toHaveBeenCalled();
    });
});
