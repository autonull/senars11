import { jest } from '@jest/globals';

// Mock Component
jest.unstable_mockModule('../../../src/components/Component.js', () => ({
    Component: class {
        constructor(container) { this.container = container; }
        render() {}
    }
}));

// Mock Core Constants
jest.unstable_mockModule('@senars/core', () => ({
    UI_CONSTANTS: {
        LOG_ICONS: { INFO: 'ℹ️' },
        LOG_TYPES: { INFO: 'info' }
    }
}));

// Mock Highlighter
jest.unstable_mockModule('../../../src/utils/NarseseHighlighter.js', () => ({
    NarseseHighlighter: { highlight: (text) => text }
}));

// Mock WidgetFactory
const mockRender = jest.fn();
jest.unstable_mockModule('../../../src/components/widgets/WidgetFactory.js', () => ({
    WidgetFactory: {
        createWidget: jest.fn((type, container, config) => {
            if (type === 'test') {
                return { render: mockRender, container };
            }
            return null;
        })
    }
}));

// Import LogViewer dynamically
const { LogViewer } = await import('../../../src/components/LogViewer.js');
const { WidgetFactory } = await import('../../../src/components/widgets/WidgetFactory.js');

describe('Dynamic Widgets in LogViewer', () => {
    let logViewer;
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        logViewer = new LogViewer(container);
        mockRender.mockClear();
        WidgetFactory.createWidget.mockClear();
    });

    test('should render a widget when log content requests it', () => {
        const widgetRequest = {
            type: 'widget',
            widgetType: 'test',
            config: { title: 'Hello Widget' }
        };

        const entry = logViewer.addLog(widgetRequest, 'info');

        // Check Factory call
        expect(WidgetFactory.createWidget).toHaveBeenCalledWith(
            'test',
            expect.any(HTMLElement), // container
            { title: 'Hello Widget' }
        );

        // Check Render call
        expect(mockRender).toHaveBeenCalled();

        // Check DOM structure
        const widgetContainer = entry.querySelector('.log-widget-container');
        expect(widgetContainer).toBeTruthy();
    });

    test('should handle unknown widget types gracefully', () => {
        const invalidRequest = {
            type: 'widget',
            widgetType: 'unknown'
        };

        const entry = logViewer.addLog(invalidRequest, 'error');

        expect(WidgetFactory.createWidget).toHaveBeenCalled();
        expect(mockRender).not.toHaveBeenCalled();
        expect(entry.textContent).toContain('Widget Error');
    });

    test('should render normal objects as JSON', () => {
        const normalObject = { key: 'value' };
        const entry = logViewer.addLog(normalObject, 'info');

        expect(WidgetFactory.createWidget).not.toHaveBeenCalled();
        expect(entry.textContent).toContain('key');
        expect(entry.textContent).toContain('value');
    });
});
