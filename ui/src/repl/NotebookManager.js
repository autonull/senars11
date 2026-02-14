import { VIEW_MODES } from './MessageFilter.js';
import { CodeCell } from './cells/CodeCell.js';
import { ResultCell } from './cells/ResultCell.js';
import { MarkdownCell } from './cells/MarkdownCell.js';
import { PromptCell } from './cells/PromptCell.js';
import { WidgetCell } from './cells/WidgetCell.js';
import { Config } from '../config/Config.js';

/**
 * Notebook manager for REPL cells
 */
export class NotebookManager {
    constructor(container, options = {}) {
        this.container = container;
        this.cells = [];
        this.executionCount = 0;
        this.saveTimeout = null;
        this.storageKey = 'senars-notebook-content';
        this.defaultOnExecute = options.onExecute || null;
        this.viewMode = 'list';
        this.viewContainer = document.createElement('div');
        this.viewContainer.style.cssText = 'height: 100%; width: 100%; position: relative;';
        this.container.appendChild(this.viewContainer);

        this.dragSrcEl = null;

        this.switchView('list');
    }

    switchView(mode) {
        this.viewMode = mode;
        this.viewContainer.innerHTML = '';
        this.viewContainer.className = `view-mode-${mode}`;

        if (mode === 'list') {
            this.viewContainer.style.overflowY = 'auto';
            this.viewContainer.style.display = 'block';
            this.cells.forEach(cell => {
                const el = cell.render();
                this._addDnDListeners(el, cell);
                this.viewContainer.appendChild(el);
            });
        } else if (mode === 'grid') {
            this._renderGridView(false);
        } else if (mode === 'icon') {
            this._renderGridView(true);
        } else if (mode === 'graph') {
             this.viewContainer.style.overflow = 'hidden';
             this._initGraphView();
        }
    }

    _addDnDListeners(el, cell) {
        el.addEventListener('dragstart', (e) => {
            this.dragSrcEl = el;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', cell.id);
            el.style.opacity = '0.4';
            el.classList.add('dragging');
        });

        el.addEventListener('dragover', (e) => {
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('drag-over');
            return false;
        });

        el.addEventListener('dragenter', (e) => {
            el.classList.add('drag-over');
        });

        el.addEventListener('dragleave', (e) => {
            el.classList.remove('drag-over');
        });

        el.addEventListener('dragend', (e) => {
            el.style.opacity = '1';
            el.classList.remove('dragging');
            this.cells.forEach(c => c.element?.classList.remove('drag-over'));
        });

        el.addEventListener('drop', (e) => {
            if (e.stopPropagation) e.stopPropagation();

            const srcId = e.dataTransfer.getData('text/plain');
            const srcCell = this.cells.find(c => c.id === srcId);
            const targetCell = cell;

            if (srcCell && srcCell !== targetCell) {
                const srcIndex = this.cells.indexOf(srcCell);
                const targetIndex = this.cells.indexOf(targetCell);

                this.cells.splice(srcIndex, 1);
                this.cells.splice(targetIndex, 0, srcCell);

                if (srcIndex < targetIndex) {
                    targetCell.element.after(srcCell.element);
                } else {
                    targetCell.element.before(srcCell.element);
                }

                this.triggerSave();
            }
            return false;
        });
    }

    _renderGridView(isIconMode) {
        this.viewContainer.style.overflowY = 'auto';
        this.viewContainer.style.display = 'grid';

        const size = isIconMode ? '100px' : '200px';
        this.viewContainer.style.gridTemplateColumns = `repeat(auto-fill, minmax(${size}, 1fr))`;
        this.viewContainer.style.gap = '10px';
        this.viewContainer.style.padding = '10px';

        this.cells.forEach(cell => {
            const wrapper = document.createElement('div');
            wrapper.className = 'grid-cell-wrapper';
            wrapper.style.cssText = `
                background: #252526; border: 1px solid #3c3c3c; border-radius: 4px;
                padding: 8px; height: ${isIconMode ? '100px' : '150px'}; overflow: hidden; position: relative;
                cursor: pointer; transition: transform 0.2s; display: flex; flex-direction: column;
            `;
            wrapper.onmouseenter = () => wrapper.style.transform = 'scale(1.02)';
            wrapper.onmouseleave = () => wrapper.style.transform = 'scale(1)';
            wrapper.onclick = () => {
                 this.switchView('list');
                 cell.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                 cell.element.style.borderColor = '#00ff9d';
                 setTimeout(() => cell.element.style.borderColor = '#3c3c3c', 1000);
            };

            const iconMap = {
                code: '💻', result: '✨', markdown: '📝', widget: '🧩', prompt: '🤖'
            };

            const icon = document.createElement('div');
            icon.style.cssText = `font-size: ${isIconMode ? '24px' : '16px'}; text-align: center; margin-bottom: 4px;`;
            icon.textContent = iconMap[cell.type] || '📄';

            wrapper.appendChild(icon);

            if (!isIconMode) {
                const typeBadge = document.createElement('div');
                typeBadge.style.cssText = 'font-size: 10px; color: #888; text-transform: uppercase; text-align: center; margin-bottom: 4px;';
                typeBadge.textContent = cell.type;
                wrapper.appendChild(typeBadge);
            }

            const contentPreview = document.createElement('div');
            contentPreview.style.cssText = 'font-size: 10px; color: #ccc; word-break: break-all; flex: 1; overflow: hidden; opacity: 0.8;';

            let text = typeof cell.content === 'string' ? cell.content : JSON.stringify(cell.content);
            if (text.length > 200) text = text.substring(0, 200) + '...';
            contentPreview.textContent = text;

            wrapper.appendChild(contentPreview);
            this.viewContainer.appendChild(wrapper);
        });
    }

    _initGraphView() {
        if (!window.cytoscape) {
            this.viewContainer.innerHTML = 'Cytoscape library not loaded.';
            return;
        }

        const cyContainer = document.createElement('div');
        cyContainer.style.cssText = 'width: 100%; height: 100%; background: #1e1e1e;';
        this.viewContainer.appendChild(cyContainer);

        const cellNodes = this.cells.map((cell, index) => ({
            group: 'nodes',
            data: {
                id: cell.id,
                label: `[${index}] ${cell.type}`,
                type: cell.type,
                content: cell.content,
                isCell: true
            }
        }));

        const termNodes = new Map();
        const termEdges = [];

        this.cells.forEach(cell => {
            const text = typeof cell.content === 'string' ? cell.content : JSON.stringify(cell.content);
            if (!text) return;

            const narsTerms = text.match(/<([^>]+)>/g) || [];
            narsTerms.forEach(t => {
                const term = t.replace(/[<>]/g, '');
                if (!termNodes.has(term)) {
                    termNodes.set(term, { group: 'nodes', data: { id: `term_${term}`, label: term, type: 'term', isCell: false } });
                }
                termEdges.push({ group: 'edges', data: { source: cell.id, target: `term_${term}`, label: 'refs', type: 'ref' } });
            });

            const mettaSymbols = text.match(/\(([^)\s]+)/g) || [];
            mettaSymbols.forEach(s => {
                const sym = s.substring(1);
                if (sym.length > 2 && !['match', 'let', 'type', 'print'].includes(sym)) {
                    if (!termNodes.has(sym)) {
                        termNodes.set(sym, { group: 'nodes', data: { id: `term_${sym}`, label: sym, type: 'term', isCell: false } });
                    }
                    termEdges.push({ group: 'edges', data: { source: cell.id, target: `term_${sym}`, label: 'refs', type: 'ref' } });
                }
            });
        });

        const edges = [];
        for (let i = 0; i < this.cells.length - 1; i++) {
            edges.push({
                group: 'edges',
                data: {
                    source: this.cells[i].id,
                    target: this.cells[i+1].id,
                    label: 'next',
                    type: 'flow'
                }
            });
        }

        const elements = [...cellNodes, ...Array.from(termNodes.values()), ...edges, ...termEdges];

        this.cy = window.cytoscape({
            container: cyContainer,
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#444',
                        'label': 'data(label)',
                        'color': '#fff',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'font-size': '10px',
                        'width': '40px',
                        'height': '40px'
                    }
                },
                {
                    selector: 'node[type="term"]',
                    style: { 'background-color': '#5c2d91', 'shape': 'ellipse', 'width': '30px', 'height': '30px', 'font-size': '8px' }
                },
                {
                    selector: 'node[type="code"]',
                    style: { 'background-color': '#0e639c', 'shape': 'rectangle', 'width': '60px' }
                },
                {
                    selector: 'node[type="result"]',
                    style: { 'background-color': '#00ff9d', 'color': '#000', 'shape': 'round-rectangle', 'width': '60px' }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#555',
                        'target-arrow-color': '#555',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'opacity': 0.5
                    }
                },
                {
                    selector: 'edge[type="ref"]',
                    style: { 'line-color': '#5c2d91', 'width': 1, 'line-style': 'dashed', 'target-arrow-shape': 'none' }
                },
                {
                    selector: 'edge[type="flow"]',
                    style: { 'line-color': '#888', 'width': 2, 'target-arrow-color': '#888' }
                }
            ],
            layout: {
                name: 'fcose',
                animate: true
            }
        });

        try {
            this.cy.layout({ name: 'fcose', animate: true }).run();
        } catch (e) {
            this.cy.layout({ name: 'grid' }).run();
        }

        this.cy.on('tap', 'node', (evt) => {
            const data = evt.target.data();
            if (data.isCell) {
                this.switchView('list');
                const cell = this.cells.find(c => c.id === data.id);
                if (cell) {
                    setTimeout(() => {
                        cell.element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        cell.element.style.borderColor = '#00ff9d';
                        setTimeout(() => cell.element.style.borderColor = '#3c3c3c', 1000);
                    }, 100);
                }
            } else {
                const connected = evt.target.neighborhood();
                this.cy.elements().removeClass('highlight');
                connected.addClass('highlight');
                evt.target.addClass('highlight');
            }
        });

        this.cy.on('mouseover', 'node', (evt) => {
            const container = this.viewContainer;
            const data = evt.target.data();

            const tip = document.createElement('div');
            tip.className = 'graph-tooltip';
            tip.style.cssText = `
                position: absolute; background: #252526; color: white; padding: 5px;
                border: 1px solid #444; border-radius: 3px; font-size: 11px; z-index: 100;
                pointer-events: none; max-width: 200px; word-break: break-all;
            `;

            let content = data.label;
            if (data.isCell) {
                 const text = typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
                 content = `${data.type.toUpperCase()}:\n${text.substring(0, 100)}${text.length>100?'...':''}`;
            }
            tip.textContent = content;

            container.appendChild(tip);

            const moveHandler = (e) => {
                 const rect = container.getBoundingClientRect();
                 tip.style.left = (e.clientX - rect.left + 10) + 'px';
                 tip.style.top = (e.clientY - rect.top + 10) + 'px';
            };

            container.addEventListener('mousemove', moveHandler);

            evt.target.once('mouseout', () => {
                tip.remove();
                container.removeEventListener('mousemove', moveHandler);
            });
        });
    }

    _updateGraphData() {
        if (this.viewMode === 'graph') {
             this.switchView('graph');
        }
    }

    addCell(cell) {
        this.cells.push(cell);

        if (this.viewMode === 'list') {
            const el = cell.render();
            this._addDnDListeners(el, cell);
            this.viewContainer.appendChild(el);
            this.scrollToBottom();
        } else {
             this.switchView(this.viewMode);
        }

        this.triggerSave();
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
            if (executeHandler) executeHandler(content, cellInstance);
            this.handleCellExecution(cellInstance, options);
        };
        const cell = new CodeCell(content, wrappedExecute);
        this._bindCellEvents(cell);
        cell.onInsertAfter = (type) => this.insertCellAfter(cell, type);
        return this.addCell(cell);
    }

    createResultCell(content, category = 'result', viewMode = VIEW_MODES.FULL) {
        return this.addCell(new ResultCell(content, category, viewMode));
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
        const index = this.cells.indexOf(cell);
        if (index > -1) this.cells.splice(index, 1);

        if (this.viewMode === 'list') {
            cell.element?.remove();
        } else {
             this.switchView(this.viewMode);
        }

        cell.destroy();
        this.triggerSave();
    }

    moveCellUp(cell) {
        const index = this.cells.indexOf(cell);
        if (index > 0) {
            this.cells.splice(index, 1);
            this.cells.splice(index - 1, 0, cell);

            if (this.viewMode === 'list') {
                const prev = cell.element.previousElementSibling;
                if (prev) {
                    this.viewContainer.insertBefore(cell.element, prev);
                }
            } else {
                this.switchView(this.viewMode);
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
        const index = this.cells.indexOf(cell);
        if (index > -1 && index < this.cells.length - 1) {
            this.cells.splice(index, 1);
            this.cells.splice(index + 1, 0, cell);

            if (this.viewMode === 'list') {
                const next = cell.element.nextElementSibling;
                if (next) {
                    this.viewContainer.insertBefore(cell.element, next.nextElementSibling);
                }
            } else {
                this.switchView(this.viewMode);
            }
            this.triggerSave();
        }
    }

    duplicateCell(cell) {
        if (cell instanceof CodeCell) {
            const newCell = this.createCodeCell(cell.content, cell.onExecute);
            this.removeCell(newCell);

            const index = this.cells.indexOf(cell);
            this.cells.splice(index + 1, 0, newCell);

            if (this.viewMode === 'list') {
                if (cell.element.nextElementSibling) {
                    this.viewContainer.insertBefore(newCell.render(), cell.element.nextElementSibling);
                } else {
                    this.viewContainer.appendChild(newCell.render());
                }
            } else {
                this.switchView(this.viewMode);
            }
            this.triggerSave();
        }
    }

    insertCellAfter(referenceCell, type = 'code') {
        let newCell;
        if (type === 'code') {
            newCell = this.createCodeCell('', referenceCell.onExecute);
        } else if (type === 'markdown') {
            newCell = this.createMarkdownCell('');
        }

        if (newCell) {
            this.removeCell(newCell);
            const index = this.cells.indexOf(referenceCell);
            this.cells.splice(index + 1, 0, newCell);

            if (this.viewMode === 'list') {
                if (referenceCell.element.nextElementSibling) {
                    this.viewContainer.insertBefore(newCell.render(), referenceCell.element.nextElementSibling);
                } else {
                    this.viewContainer.appendChild(newCell.render());
                }
                newCell.focus();
            } else {
                this.switchView(this.viewMode);
            }
            this.triggerSave();
        }
    }

    runAll() {
        this.cells.forEach(cell => {
            if (cell instanceof CodeCell) {
                cell.execute();
            }
        });
    }

    clearOutputs() {
        const toRemove = this.cells.filter(c => c instanceof ResultCell || c instanceof WidgetCell);
        toRemove.forEach(c => this.removeCell(c));
    }

    clear() {
        this.cells.forEach(cell => cell.destroy());
        this.cells = [];
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
