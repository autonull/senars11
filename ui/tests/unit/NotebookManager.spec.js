import { jest } from '@jest/globals';
import { NotebookManager, MarkdownCell, WidgetCell } from '../../src/repl/NotebookManager.js';

describe('NotebookManager', () => {
    let container;
    let manager;

    beforeEach(() => {
        container = document.createElement('div');
        manager = new NotebookManager(container);
    });

    test('should create a markdown cell', () => {
        const cell = manager.createMarkdownCell('**bold**');
        expect(cell).toBeInstanceOf(MarkdownCell);
        expect(cell.content).toBe('**bold**');
        expect(manager.cells).toContain(cell);

        // Verify rendering
        const rendered = cell.element;
        expect(rendered.className).toContain('markdown-cell');
        // Preview should have parsed content
        // marked should parse **bold** to <p><strong>bold</strong></p>\n
        expect(rendered.innerHTML).toContain('<strong>bold</strong>');
    });

    test('should create a widget cell', () => {
        const cell = manager.createWidgetCell('TruthSlider', { frequency: 0.8 });
        expect(cell).toBeInstanceOf(WidgetCell);
        expect(cell.widgetType).toBe('TruthSlider');
        expect(cell.content).toEqual({ frequency: 0.8 });
        expect(manager.cells).toContain(cell);

        // Verify rendering
        const rendered = cell.element;
        expect(rendered.className).toContain('widget-cell');
        expect(rendered.innerHTML).toContain('TruthSlider');
    });

    test('should import notebook with new cell types', () => {
        const data = [
            { type: 'markdown', content: '# Header' },
            { type: 'widget', widgetType: 'GraphWidget', content: [{ id: 'a' }] }
        ];

        manager.importNotebook(data);

        expect(manager.cells.length).toBe(2);
        expect(manager.cells[0]).toBeInstanceOf(MarkdownCell);
        expect(manager.cells[1]).toBeInstanceOf(WidgetCell);
    });

    test('should export notebook with new cell types', () => {
        manager.createMarkdownCell('md');
        manager.createWidgetCell('w', { val: 1 });

        const exported = manager.exportNotebook();
        expect(exported.length).toBe(2);
        expect(exported[0].type).toBe('markdown');
        expect(exported[0].content).toBe('md');
        expect(exported[1].type).toBe('widget');
        expect(exported[1].widgetType).toBe('w');
    });
});
