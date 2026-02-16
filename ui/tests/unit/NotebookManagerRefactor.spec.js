import { jest } from '@jest/globals';
import { NotebookManager } from '../../src/notebook/NotebookManager.js';
import { eventBus } from '../../src/core/EventBus.js';
import { EVENTS } from '../../src/config/constants.js';

describe('NotebookManager Refactor', () => {
    let container;
    let manager;

    beforeEach(() => {
        container = document.createElement('div');
        eventBus.clear();
        manager = new NotebookManager(container);
    });

    test('addCell emits notebook:cell:added', (done) => {
        eventBus.on(EVENTS.NOTEBOOK_CELL_ADDED, (cell) => {
            try {
                expect(cell.content).toBe('test');
                done();
            } catch (e) {
                done(e);
            }
        });
        manager.createMarkdownCell('test');
    });

    test('removeCell emits notebook:cell:removed', (done) => {
        const cell = manager.createMarkdownCell('test');
        eventBus.on(EVENTS.NOTEBOOK_CELL_REMOVED, (removed) => {
            try {
                expect(removed).toBe(cell);
                done();
            } catch (e) {
                done(e);
            }
        });
        manager.removeCell(cell);
    });

    test('cells state is reactive', () => {
        const cell = manager.createMarkdownCell('test');
        expect(manager.state.cells).toContain(cell);

        manager.removeCell(cell);
        expect(manager.state.cells).not.toContain(cell);
    });
});
