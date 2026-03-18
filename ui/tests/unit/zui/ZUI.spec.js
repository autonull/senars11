
import { jest } from '@jest/globals';
import { GraphViewport } from '../../../src/zui/GraphViewport.js';
import { SemanticZoom } from '../../../src/zui/SemanticZoom.js';
import { ContextualWidget } from '../../../src/zui/ContextualWidget.js';

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
    nodes: jest.fn(() => ({
        style: jest.fn()
    })),
    zoom: jest.fn(),
    pan: jest.fn(),
    extent: jest.fn(),
    batch: jest.fn((cb) => cb && cb()),
};
mockCy.elements.mockReturnValue({ remove: jest.fn(), removeClass: jest.fn() });

global.cytoscape = jest.fn(() => mockCy);

describe('ZUI Components', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'graph-container';
        document.body.appendChild(container);

        // Reset mocks
        mockCy.on.mockClear();
        global.cytoscape.mockClear();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    test('GraphViewport initializes correctly', () => {
        const viewport = new GraphViewport('graph-container');
        const initialized = viewport.initialize();
        expect(initialized).toBe(true);
        expect(viewport.cy).toBeDefined();
        expect(global.cytoscape).toHaveBeenCalled();
    });

    test('SemanticZoom initializes correctly', () => {
        const viewport = new GraphViewport('graph-container');
        viewport.initialize();
        const zoom = new SemanticZoom(viewport);
        expect(zoom).toBeDefined();
        expect(zoom.currentLevel).toBe('overview');
    });

    test('ContextualWidget initializes correctly', () => {
        const viewport = new GraphViewport('graph-container');
        viewport.initialize();
        const widgetContainer = document.createElement('div');
        const widgetManager = new ContextualWidget(viewport, widgetContainer);
        expect(widgetManager).toBeDefined();
    });
});
