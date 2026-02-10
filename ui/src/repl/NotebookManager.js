import { VIEW_MODES, MESSAGE_CATEGORIES } from './MessageFilter.js';
import { TruthSlider } from '../components/widgets/TruthSlider.js';
import { SimpleGraphWidget } from '../components/widgets/SimpleGraphWidget.js';
import { ChartWidget } from '../components/widgets/ChartWidget.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';
import { marked } from 'marked';

/**
 * Base class for REPL cells
 */
export class REPLCell {
    constructor(type, content = '') {
        this.id = `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.type = type;
        this.content = content;
        this.timestamp = Date.now();
        this.element = null;
    }

    render() {
        throw new Error('REPLCell.render() must be implemented by subclass');
    }

    destroy() {
        this.element?.parentNode?.removeChild(this.element);
    }

    _createActionBtn(icon, title, onClick) {
        const btn = document.createElement('button');
        btn.innerHTML = icon;
        btn.title = title;
        btn.style.cssText = 'background: transparent; border: none; cursor: pointer; color: #ccc; font-size: 1em; padding: 0 2px;';
        btn.onclick = (e) => {
            e.stopPropagation();
            onClick(e);
        };
        return btn;
    }
}

/**
 * Code cell for user input
 */
export class CodeCell extends REPLCell {
    constructor(content = '', onExecute = null) {
        super('code', content);
        this.onExecute = onExecute;
        this.isEditing = true;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell code-cell';
        this.element.dataset.cellId = this.id;
        this.element.style.cssText = `
            margin-bottom: 12px;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            background: #1e1e1e;
            overflow: hidden;
            transition: border-color 0.2s;
        `;

        this.element.appendChild(this._createToolbar());

        this.editorContainer = document.createElement('div');
        this.element.appendChild(this.editorContainer);
        this.updateMode();

        return this.element;
    }

    updateMode() {
        this.editorContainer.innerHTML = '';
        if (this.isEditing) {
            this.editorContainer.appendChild(this._createEditor());
            requestAnimationFrame(() => this.editor?.focus());
        } else {
            this.editorContainer.appendChild(this._createPreview());
        }
    }

    _createPreview() {
        const preview = document.createElement('div');
        preview.className = 'code-preview';
        preview.innerHTML = NarseseHighlighter.highlight(this.content);
        preview.style.cssText = `
            padding: 10px; font-family: monospace; font-size: 0.95em;
            color: #d4d4d4; white-space: pre-wrap; cursor: pointer;
            border-left: 2px solid transparent;
        `;
        preview.title = 'Double-click to edit';
        preview.ondblclick = () => {
            this.isEditing = true;
            this.updateMode();
        };
        return preview;
    }

    _createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'cell-toolbar';
        toolbar.style.cssText = `
            padding: 4px 8px;
            background: #252526;
            border-bottom: 1px solid #3c3c3c;
            display: flex; gap: 8px; align-items: center; font-size: 0.85em;
        `;

        const label = document.createElement('span');
        label.textContent = '💻 Code';
        label.style.color = '#888';

        const runBtn = this._createButton('▶️', 'Run', '#0e639c', () => this.execute());

        const toggleBtn = this._createButton(this.isEditing ? '👁️' : '✏️', 'Toggle View', '#333', () => {
            this.isEditing = !this.isEditing;
            this.updateMode();
            // Update button label
            toggleBtn.innerHTML = this.isEditing ? '👁️' : '✏️';
        });

        const deleteBtn = this._createButton('🗑️', 'Delete', '#b30000', () => this.delete());
        deleteBtn.style.marginLeft = 'auto';

        toolbar.append(label, runBtn, toggleBtn, deleteBtn);
        return toolbar;
    }

    _createButton(icon, title, bg, onClick) {
        const btn = document.createElement('button');
        btn.innerHTML = icon;
        btn.title = title;
        btn.style.cssText = `padding: 2px 8px; background: ${bg}; color: white; border: none; cursor: pointer; border-radius: 2px;`;
        btn.onclick = onClick;
        return btn;
    }

    _createEditor() {
        const editor = document.createElement('textarea');
        editor.className = 'cell-editor';
        editor.value = this.content;
        editor.placeholder = 'Enter Narsese or MeTTa...';
        editor.rows = Math.max(3, this.content.split('\n').length);
        editor.style.cssText = `
            width: 100%; background: #1e1e1e; color: #d4d4d4; border: none; padding: 10px;
            font-family: monospace; font-size: 0.95em; resize: vertical; outline: none; display: block;
        `;

        editor.addEventListener('input', (e) => {
            this.content = e.target.value;
            // Auto resize
            editor.style.height = 'auto';
            editor.style.height = editor.scrollHeight + 'px';
        });

        editor.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.execute();
            }
        });

        editor.addEventListener('focus', () => this.element.style.borderColor = '#007acc');
        editor.addEventListener('blur', () => this.element.style.borderColor = '#3c3c3c');

        this.editor = editor;
        return editor;
    }

    execute() {
        if (this.onExecute && this.content.trim()) {
            this.isEditing = false;
            this.updateMode();
            this.onExecute(this.content, this);
        }
    }

    delete() {
        if (confirm('Delete this cell?')) {
            this.destroy();
            this.onDelete?.(this);
        }
    }

    focus() {
        this.editor?.focus();
    }
}

/**
 * Result cell for output display
 */
export class ResultCell extends REPLCell {
    constructor(content, category = 'result', viewMode = VIEW_MODES.FULL) {
        super('result', content);
        this.category = category;
        this.viewMode = viewMode;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell result-cell';
        this.element.dataset.cellId = this.id;
        this.element.dataset.category = this.category;

        this.updateViewMode(this.viewMode);
        return this.element;
    }

    updateViewMode(mode) {
        this.viewMode = mode;
        if (!this.element) return;

        const catInfo = MESSAGE_CATEGORIES[this.category] || MESSAGE_CATEGORIES.unknown;
        const color = catInfo.color || '#00ff88';

        this.element.innerHTML = '';
        this.element.style.display = mode === VIEW_MODES.HIDDEN ? 'none' : 'block';
        if (mode === VIEW_MODES.HIDDEN) return;

        if (mode === VIEW_MODES.COMPACT) {
            this._renderCompact(catInfo, color);
        } else {
            this._renderFull(catInfo, color);
        }
    }

    _renderCompact(catInfo, color) {
        this.element.style.cssText = `
            margin-bottom: 2px; padding: 2px 6px; border-left: 3px solid ${color};
            background: rgba(0,0,0,0.2); border-radius: 2px; display: flex;
            align-items: center; gap: 8px; cursor: pointer; font-size: 0.85em;
        `;
        this.element.title = "Click to expand";
        this.element.onclick = () => this.updateViewMode(VIEW_MODES.FULL);

        const badge = document.createElement('span');
        badge.style.color = color;
        badge.innerHTML = `${catInfo.icon || '✨'}`;

        const preview = document.createElement('span');
        preview.style.cssText = 'color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; opacity: 0.8;';

        let previewText = typeof this.content === 'string' ? this.content : JSON.stringify(this.content);
        if (previewText.length > 80) previewText = previewText.substring(0, 80) + '...';
        preview.textContent = previewText;

        this.element.append(badge, preview);
    }

    _renderFull(catInfo, color) {
        this.element.onclick = null;
        this.element.style.cssText = `
            margin-bottom: 8px; padding: 8px; border-left: 3px solid ${color};
            background: rgba(255, 255, 255, 0.03); border-radius: 4px; position: relative;
        `;

        const actions = document.createElement('div');
        actions.className = 'cell-actions';
        actions.style.cssText = `
            position: absolute; top: 4px; right: 4px; opacity: 0; transition: opacity 0.2s;
            display: flex; gap: 6px; background: rgba(0,0,0,0.5); padding: 2px 4px; border-radius: 3px;
        `;

        this.element.onmouseenter = () => actions.style.opacity = '1';
        this.element.onmouseleave = () => actions.style.opacity = '0';

        const collapseBtn = this._createActionBtn('🔽', 'Collapse', () => this.updateViewMode(VIEW_MODES.COMPACT));

        const copyBtn = this._createActionBtn('📋', 'Copy', (e) => {
            const text = typeof this.content === 'object' ? JSON.stringify(this.content, null, 2) : this.content;
            navigator.clipboard.writeText(text);
            copyBtn.innerHTML = '✅';
            setTimeout(() => copyBtn.innerHTML = '📋', 1500);
        });

        const infoBtn = this._createActionBtn('ℹ️', 'Details', () => {
            alert(`Type: ${catInfo.label}\nTime: ${new Date(this.timestamp).toLocaleString()}\nCategory: ${this.category}`);
        });

        actions.append(copyBtn, infoBtn, collapseBtn);
        this.element.appendChild(actions);

        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'white-space: pre-wrap; font-family: monospace; color: #d4d4d4; overflow-x: auto; font-size: 0.95em;';

        if (typeof this.content === 'string') {
            contentDiv.innerHTML = NarseseHighlighter.highlight(this.content);
        } else {
            contentDiv.textContent = JSON.stringify(this.content, null, 2);
        }

        this.element.appendChild(contentDiv);
    }
}

/**
 * Markdown cell for documentation
 */
export class MarkdownCell extends REPLCell {
    constructor(content = '') {
        super('markdown', content);
        this.isEditing = false;
        this.onUpdate = null; // Callback for updates
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell markdown-cell';
        this.element.dataset.cellId = this.id;
        this.element.style.cssText = `
            margin-bottom: 12px;
            padding: 8px;
            border: 1px solid transparent;
            border-radius: 4px;
            background: transparent;
            transition: all 0.2s;
        `;

        this.element.ondblclick = () => this.toggleEdit(true);

        this.previewDiv = document.createElement('div');
        this.previewDiv.className = 'markdown-preview';
        this.previewDiv.style.color = '#d4d4d4';
        this.updatePreview();

        this.editorDiv = document.createElement('div');
        this.editorDiv.style.display = 'none';

        const textarea = document.createElement('textarea');
        textarea.value = this.content;
        textarea.rows = 5;
        textarea.style.cssText = 'width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3c3c3c; padding: 8px; font-family: monospace;';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Render';
        saveBtn.style.cssText = 'margin-top: 5px; padding: 4px 8px; cursor: pointer;';
        saveBtn.onclick = () => {
            this.content = textarea.value;
            this.toggleEdit(false);
            this.onUpdate?.();
        };

        this.editorDiv.append(textarea, saveBtn);

        this.element.append(this.previewDiv, this.editorDiv);
        return this.element;
    }

    updatePreview() {
        if (this.previewDiv) {
            this.previewDiv.innerHTML = marked.parse(this.content);
        }
    }

    toggleEdit(editing) {
        this.isEditing = editing;
        if (editing) {
            this.previewDiv.style.display = 'none';
            this.editorDiv.style.display = 'block';
            this.element.style.border = '1px solid #3c3c3c';
            this.element.style.background = '#1e1e1e';
        } else {
            this.previewDiv.style.display = 'block';
            this.editorDiv.style.display = 'none';
            this.element.style.border = '1px solid transparent';
            this.element.style.background = 'transparent';
            this.updatePreview();
        }
    }
}

/**
 * Widget cell for interactive components
 */
export class WidgetCell extends REPLCell {
    constructor(widgetType, data = {}) {
        super('widget', data);
        this.widgetType = widgetType;
        this.widgetInstance = null;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell widget-cell';
        this.element.style.cssText = 'margin-bottom: 12px; border: 1px solid #333; background: #1e1e1e; border-radius: 4px; padding: 10px;';

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px;';
        header.innerHTML = `<span>🧩 ${this.widgetType}</span>`;

        const closeBtn = this._createActionBtn('✖️', 'Remove', () => this.destroy());
        header.appendChild(closeBtn);

        const content = document.createElement('div');
        content.style.position = 'relative';

        this.element.append(header, content);

        if (this.widgetType === 'TruthSlider') {
            this.widgetInstance = new TruthSlider(content, {
                frequency: this.content.frequency,
                confidence: this.content.confidence,
                onChange: (val) => console.log('Widget update:', val)
            });
            this.widgetInstance.render();
        } else if (this.widgetType === 'GraphWidget') {
            this.widgetInstance = new SimpleGraphWidget(content, this.content);
            this.widgetInstance.render();
        } else if (this.widgetType === 'ChartWidget') {
            this.widgetInstance = new ChartWidget(content, this.content);
            this.widgetInstance.render();
        } else {
            content.innerHTML = `<div style="color:red">Unknown widget: ${this.widgetType}</div>`;
        }

        return this.element;
    }
}

/**
 * Notebook manager for REPL cells
 */
export class NotebookManager {
    constructor(container) {
        this.container = container;
        this.cells = [];
        this.saveTimeout = null;
        this.storageKey = 'senars-notebook-content';
    }

    addCell(cell) {
        this.cells.push(cell);
        this.container.appendChild(cell.render());
        this.scrollToBottom();
        this.triggerSave();
        return cell;
    }

    createCodeCell(content = '', onExecute = null) {
        const cell = new CodeCell(content, onExecute);
        cell.onDelete = (c) => this.removeCell(c);
        return this.addCell(cell);
    }

    createResultCell(content, category = 'result', viewMode = VIEW_MODES.FULL) {
        // Result cells are transient usually, but we might want to save them?
        // For now, let's save them too.
        return this.addCell(new ResultCell(content, category, viewMode));
    }

    createMarkdownCell(content = '') {
        const cell = new MarkdownCell(content);
        cell.onUpdate = () => this.triggerSave();
        cell.onDelete = (c) => this.removeCell(c);
        return this.addCell(cell);
    }

    createWidgetCell(type, data = {}) {
        const cell = new WidgetCell(type, data);
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
        cell.destroy();
        this.triggerSave();
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
        // Clear save timeout to avoid immediate save of imported content (redundant)
        // But actually we might want to save it as the new state.
        this.triggerSave();
    }

    triggerSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveToStorage(), 1000); // Save after 1s of inactivity
    }

    saveToStorage() {
        try {
            const data = this.exportNotebook();
            // Filter out transient simulation data if needed, but for now save all
            // Maybe limit size?
            if (data.length > 500) data.splice(0, data.length - 500); // Keep last 500 cells
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

    /**
     * Load a demo file into the notebook
     * @param {string} path - Path to demo file
     * @param {Object} options - Loading options
     */
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
