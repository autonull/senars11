import { VIEW_MODES } from './MessageFilter.js';
import { CodeCell } from './cells/CodeCell.js';
import { ResultCell } from './cells/ResultCell.js';
import { MarkdownCell } from './cells/MarkdownCell.js';
import { PromptCell } from './cells/PromptCell.js';
import { WidgetCell } from './cells/WidgetCell.js';
import { Config } from '../config/Config.js';
import { NotebookGraphView } from './views/NotebookGraphView.js';
import { NotebookGridView } from './views/NotebookGridView.js';
import { ReactiveState } from '../core/ReactiveState.js';
import { eventBus } from '../core/EventBus.js';
import { EVENTS, STORAGE_KEYS } from '../config/constants.js';

/**
 * Notebook manager for Notebook cells
 */
export class NotebookManager {
    constructor(container, options = {}) {
        this.container = container;
        this.state = new ReactiveState({
            cells: [],
            viewMode: 'list'
        });

        this.history = []; // Undo stack
        this.executionCount = 0;
        this.saveTimeout = null;
        this.storageKey = STORAGE_KEYS.NOTEBOOK_CONTENT;
        this.defaultOnExecute = options.onExecute || null;
        this.lastInsertionPoint = null;

        this.viewContainer = document.createElement('div');
        this.viewContainer.style.cssText = 'height: 100%; width: 100%; position: relative;';
        this.container.appendChild(this.viewContainer);

        this.dragSrcEl = null;
        this.graphView = null;
        this.gridView = null;

        // Watch for view mode changes
        this.state.watch('viewMode', (mode) => this._renderView(mode));

        // Initial render
        this._renderView('list');
    }

    get cells() {
        return this.state.cells;
    }

    get viewMode() {
        return this.state.viewMode;
    }

    switchView(mode, targetCellId = null) {
        this.state.viewMode = mode;
        if (targetCellId) {
            // Wait for render
            setTimeout(() => {
                const cell = this.state.cells.find(c => c.id === targetCellId);
                if (cell) {
                    cell.element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    cell.element.style.borderColor = '#00ff9d';
                    setTimeout(() => cell.element.style.borderColor = '#3c3c3c', 1000);
                }
            }, 100);
        }
    }

    _renderView(mode) {
        this.viewContainer.innerHTML = '';
        this.viewContainer.className = `view-mode-${mode}`;

        if (mode === 'list') {
            this.viewContainer.style.overflowY = 'auto';
            this.viewContainer.style.display = 'block';
            for (const cell of this.state.cells) {
                const el = cell.render();
                this._addDnDListeners(el, cell);
                this.viewContainer.appendChild(el);
            }
        } else if (mode === 'grid') {
            this.gridView = new NotebookGridView(this.viewContainer, this.state.cells, (m, id) => this.switchView(m, id));
            this.gridView.render(false);
        } else if (mode === 'icon') {
            this.gridView = new NotebookGridView(this.viewContainer, this.state.cells, (m, id) => this.switchView(m, id));
            this.gridView.render(true);
        } else if (mode === 'graph') {
             this.viewContainer.style.overflow = 'hidden';
             this.graphView = new NotebookGraphView(this.viewContainer, this.state.cells, (m, id) => this.switchView(m, id));
             this.graphView.render();
        }
    }

    _addDnDListeners(el, cell) {
        el.addEventListener('dragstart', (e) => this._onDragStart(e, el, cell));
        el.addEventListener('dragover', (e) => this._onDragOver(e, el));
        el.addEventListener('dragenter', () => el.classList.add('drag-over'));
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('dragend', (e) => this._onDragEnd(el));
        el.addEventListener('drop', (e) => this._onDrop(e, cell));
    }

    _onDragStart(e, el, cell) {
        this.dragSrcEl = el;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cell.id);
        el.style.opacity = '0.4';
        el.classList.add('dragging');
    }

    _onDragOver(e, el) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
        return false;
    }

    _onDragEnd(el) {
        el.style.opacity = '1';
        el.classList.remove('dragging');
        this.state.cells.forEach(c => c.element?.classList.remove('drag-over'));
    }

    _onDrop(e, targetCell) {
        if (e.stopPropagation) e.stopPropagation();

        const srcId = e.dataTransfer.getData('text/plain');
        const srcCell = this.state.cells.find(c => c.id === srcId);

        if (srcCell && srcCell !== targetCell) {
            const currentCells = [...this.state.cells];
            const srcIndex = currentCells.indexOf(srcCell);
            const targetIndex = currentCells.indexOf(targetCell);

            currentCells.splice(srcIndex, 1);
            currentCells.splice(targetIndex, 0, srcCell);

            this.state.cells = currentCells;

            // DOM order update optimization for list mode is handled here manually
            // though reactive update would handle it, this is smoother for drag
            if (this.state.viewMode === 'list') {
                if (srcIndex < targetIndex) {
                    targetCell.element.after(srcCell.element);
                } else {
                    targetCell.element.before(srcCell.element);
                }
            }

            this.triggerSave();
        }
        return false;
    }

    _updateGraphData() {
        if (this.state.viewMode === 'graph') {
             this._renderView('graph');
        }
    }

    addCell(cell) {
        this.state.cells = [...this.state.cells, cell];

        if (this.state.viewMode === 'list') {
            const el = cell.render();
            this._addDnDListeners(el, cell);
            this.viewContainer.appendChild(el);
            this.scrollToBottom();
        } else {
             this._renderView(this.state.viewMode);
        }

        this.triggerSave();
        eventBus.emit(EVENTS.NOTEBOOK_CELL_ADDED, cell);
        return cell;
    }

    _bindCellEvents(cell) {
        cell.onDelete = (c) => this.removeCell(c);
        cell.onMoveUp = (c) => this.moveCellUp(c);
        cell.onMoveDown = (c) => this.moveCellDown(c);
        cell.onDuplicate = (c) => this.duplicateCell(c);
    }

    createCodeCell(content = '', onExecute = null) {
        const executeHandler = onExecute || this.defaultOnExecute;
        const wrappedExecute = (content, cellInstance, options) => {
            this.executionCount++;
            cellInstance.executionCount = this.executionCount;
            this.lastInsertionPoint = cellInstance;
            if (executeHandler) executeHandler(content, cellInstance);
            this.handleCellExecution(cellInstance, options);
        };
        const cell = new CodeCell(content, wrappedExecute);
        this._bindCellEvents(cell);
        cell.onInsertAfter = (type) => this.insertCellAfter(cell, type);
        return this.addCell(cell);
    }

    createResultCell(content, category = 'result', viewMode = VIEW_MODES.FULL) {
        const cell = new ResultCell(content, category, viewMode);

        if (this.lastInsertionPoint && this.cells.includes(this.lastInsertionPoint)) {
            this.insertCell(cell, this.lastInsertionPoint);
            this.lastInsertionPoint = cell;
            return cell;
        }

        return this.addCell(cell);
    }

    createMarkdownCell(content = '') {
        const cell = new MarkdownCell(content);
        cell.onUpdate = () => this.triggerSave();
        cell.onDelete = (c) => this.removeCell(c);
        return this.addCell(cell);
    }

    createPromptCell(question, onResponse) {
        const cell = new PromptCell(question, onResponse);
        return this.addCell(cell);
    }

    createWidgetCell(type, data = {}) {
        const cell = new WidgetCell(type, data, this.constructor);
        cell.onDelete = (c) => this.removeCell(c);
        return this.addCell(cell);
    }

    applyFilter(messageFilter) {
        this.cells.forEach(cell => {
            if (cell instanceof ResultCell) {
                const fakeMsg = { type: cell.category, content: cell.content };
                cell.updateViewMode(messageFilter.getMessageViewMode(fakeMsg));
            }
        });
    }

    removeCell(cell) {
        const currentCells = [...this.state.cells];
        const index = currentCells.indexOf(cell);

        if (index > -1) {
            // Push to undo history
            this.history.push({ action: 'delete', cell, index });
            if (this.history.length > 50) this.history.shift();

            currentCells.splice(index, 1);
            this.state.cells = currentCells;
        }

        if (this.state.viewMode === 'list') {
            cell.element?.remove();
        } else {
             this._renderView(this.state.viewMode);
        }

        // Don't fully destroy if we want to undo, but DOM element is removed
        // cell.destroy();
        this.triggerSave();
        eventBus.emit(EVENTS.NOTEBOOK_CELL_REMOVED, cell);
    }

    undo() {
        const lastAction = this.history.pop();
        if (!lastAction) return;

        if (lastAction.action === 'delete') {
            const { cell, index } = lastAction;
            const currentCells = [...this.state.cells];
            currentCells.splice(index, 0, cell);
            this.state.cells = currentCells;

            if (this.state.viewMode === 'list') {
                const el = cell.element || cell.render();
                // Rebind events as elements might lose listeners if re-rendered
                this._addDnDListeners(el, cell);

                // Find insertion point
                const nextCell = currentCells[index + 1];
                if (nextCell && nextCell.element) {
                    this.viewContainer.insertBefore(el, nextCell.element);
                } else {
                    this.viewContainer.appendChild(el);
                }
            } else {
                this._renderView(this.state.viewMode);
            }
            this.triggerSave();
        }
    }

    moveCellUp(cell) {
        const currentCells = [...this.state.cells];
        const index = currentCells.indexOf(cell);

        if (index > 0) {
            currentCells.splice(index, 1);
            currentCells.splice(index - 1, 0, cell);
            this.state.cells = currentCells;

            if (this.state.viewMode === 'list') {
                const prev = cell.element.previousElementSibling;
                if (prev) {
                    this.viewContainer.insertBefore(cell.element, prev);
                }
            } else {
                this._renderView(this.state.viewMode);
            }
            this.triggerSave();
        }
    }

    focusNextCell(cell) {
        const index = this.cells.indexOf(cell);
        if (index > -1 && index < this.cells.length - 1) {
            const next = this.cells[index + 1];
            if (next instanceof CodeCell) next.focus();
        }
    }

    focusPrevCell(cell) {
        const index = this.cells.indexOf(cell);
        if (index > 0) {
            const prev = this.cells[index - 1];
            if (prev instanceof CodeCell) prev.focus();
        }
    }

    handleCellExecution(cell, options = {}) {
        eventBus.emit(EVENTS.NOTEBOOK_CELL_EXECUTED, cell);

        if (options.advance) {
            const index = this.cells.indexOf(cell);
            let nextIndex = index + 1;
            while(nextIndex < this.cells.length && !(this.cells[nextIndex] instanceof CodeCell)) {
                nextIndex++;
            }

            if (nextIndex < this.cells.length) {
                this.cells[nextIndex].focus();
            } else {
                const newCell = this.createCodeCell('', cell.onExecute);
                newCell.focus();
            }
        }
    }

    moveCellDown(cell) {
        const currentCells = [...this.state.cells];
        const index = currentCells.indexOf(cell);

        if (index > -1 && index < currentCells.length - 1) {
            currentCells.splice(index, 1);
            currentCells.splice(index + 1, 0, cell);
            this.state.cells = currentCells;

            if (this.state.viewMode === 'list') {
                const next = cell.element.nextElementSibling;
                if (next) {
                    this.viewContainer.insertBefore(cell.element, next.nextElementSibling);
                }
            } else {
                this._renderView(this.state.viewMode);
            }
            this.triggerSave();
        }
    }

    duplicateCell(cell) {
        if (cell instanceof CodeCell) {
            const newCell = this.createCodeCell(cell.content, cell.onExecute);
            this.removeCell(newCell);

            const currentCells = [...this.state.cells];
            const index = currentCells.indexOf(cell);
            currentCells.splice(index + 1, 0, newCell);
            this.state.cells = currentCells;

            if (this.state.viewMode === 'list') {
                if (cell.element.nextElementSibling) {
                    this.viewContainer.insertBefore(newCell.render(), cell.element.nextElementSibling);
                } else {
                    this.viewContainer.appendChild(newCell.render());
                }
            } else {
                this._renderView(this.state.viewMode);
            }
            this.triggerSave();
            eventBus.emit(EVENTS.NOTEBOOK_CELL_ADDED, newCell);
        }
    }

    insertCell(newCell, referenceCell) {
        // If cell is already in manager (e.g. via addCell), remove it first to move it
        if (this.state.cells.includes(newCell)) {
            this.removeCell(newCell);
        }

        const currentCells = [...this.state.cells];
        const index = currentCells.indexOf(referenceCell);

        if (index > -1) {
            currentCells.splice(index + 1, 0, newCell);
            this.state.cells = currentCells;

            if (this.state.viewMode === 'list') {
                const el = newCell.render ? newCell.render() : newCell.element;
                // Ensure events are bound if not already
                if (!newCell.element) this._addDnDListeners(el, newCell);
                else if (!newCell.element.classList.contains('drag-over')) this._addDnDListeners(el, newCell);

                if (referenceCell.element && referenceCell.element.nextElementSibling) {
                    this.viewContainer.insertBefore(el, referenceCell.element.nextElementSibling);
                } else {
                    this.viewContainer.appendChild(el);
                }
            } else {
                this._renderView(this.state.viewMode);
            }
            this.triggerSave();
            eventBus.emit(EVENTS.NOTEBOOK_CELL_ADDED, newCell);
        } else {
            // Fallback
            this.addCell(newCell);
        }
        return newCell;
    }

    insertCellAfter(referenceCell, type = 'code') {
        let newCell;
        if (type === 'code') {
            newCell = this.createCodeCell('', referenceCell.onExecute);
            // Since createCodeCell adds it, we need to move it or create it detached?
            // createCodeCell calls addCell.
            // insertCell handles moving if it exists.
            this.insertCell(newCell, referenceCell);
            newCell.focus();
        } else if (type === 'markdown') {
            newCell = this.createMarkdownCell('');
            this.insertCell(newCell, referenceCell);
        }
    }

    async runAll() {
        const codeCells = this.cells.filter(cell => cell instanceof CodeCell);
        for (const cell of codeCells) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for visual feedback
            cell.execute();
        }
    }

    clearOutputs() {
        const toRemove = this.cells.filter(c => c instanceof ResultCell || c instanceof WidgetCell);
        toRemove.forEach(c => this.removeCell(c));
    }

    clear() {
        this.state.cells.forEach(cell => {
            cell.destroy();
            eventBus.emit(EVENTS.NOTEBOOK_CELL_REMOVED, cell);
        });
        this.state.cells = [];
        this.viewContainer.innerHTML = '';
        this.triggerSave();
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    exportNotebook() {
        return this.cells.map(cell => {
            const data = {
                type: cell.type,
                content: cell.content,
                timestamp: cell.timestamp
            };
            if (cell.type === 'result') {
                data.category = cell.category;
                data.viewMode = cell.viewMode;
            }
            if (cell.type === 'widget') data.widgetType = cell.widgetType;
            return data;
        });
    }

    importNotebook(data) {
        this.clear();
        data.forEach(d => {
            if (d.type === 'code') this.createCodeCell(d.content);
            else if (d.type === 'result') this.createResultCell(d.content, d.category, d.viewMode);
            else if (d.type === 'markdown') this.createMarkdownCell(d.content);
            else if (d.type === 'widget') this.createWidgetCell(d.widgetType, d.content);
        });
        this.triggerSave();
    }

    triggerSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveToStorage(), 1000);
    }

    saveToStorage() {
        try {
            const data = this.exportNotebook();
            const limit = Config.getConstants().MAX_NOTEBOOK_CELLS || 500;
            if (data.length > limit) data.splice(0, data.length - limit);
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save notebook', e);
        }
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                if (Array.isArray(data) && data.length > 0) {
                    this.importNotebook(data);
                    return true;
                }
            }
        } catch (e) {
            console.warn('Failed to load notebook', e);
        }
        return false;
    }

    async loadDemoFile(path, options = {}) {
        const { clearFirst = false, autoRun = false } = options;

        if (clearFirst) this.clear();

        try {
            const response = await fetch(`/${path}`);
            if (!response.ok) throw new Error(`Failed to load demo: ${path}`);
            const content = await response.text();

            const cell = this.createCodeCell(content.trim());

            if (autoRun) {
                await new Promise(resolve => setTimeout(resolve, 100));
                cell.execute();
            }

            const fileName = path.split('/').pop();
            const lineCount = content.trim().split('\n').length;
            this.createResultCell(
                `📚 Loaded demo: ${fileName} (${lineCount} lines)`,
                'system'
            );
        } catch (error) {
            this.createResultCell(
                `❌ Failed to load demo: ${error.message}`,
                'system'
            );
            throw error;
        }
    }
}
