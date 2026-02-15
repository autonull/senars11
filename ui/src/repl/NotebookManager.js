import { VIEW_MODES, MESSAGE_CATEGORIES } from './MessageFilter.js';
import { WidgetFactory } from '../components/widgets/WidgetFactory.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';
import { SmartTextarea } from './SmartTextarea.js';
import { ConceptCard } from '../components/ConceptCard.js';
import { TaskCard } from '../components/TaskCard.js';
import { marked } from 'marked';
import { Toast } from '../components/ui/Toast.js';
import { Modal } from '../components/ui/Modal.js';
import { Toolbar } from '../components/ui/Toolbar.js';

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
        // Keeping this for non-Toolbar usages (like absolute positioned actions)
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
        this.executionCount = null;
        this.lastRunTime = null;
        this.isCollapsed = false;
    }

    destroy() {
        this.smartEditor?.destroy();
        super.destroy();
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell code-cell';
        this.element.dataset.cellId = this.id;
        this.element.draggable = true;
        this.element.style.cssText = `
            margin-bottom: 12px;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            background: #1e1e1e;
            overflow: hidden;
            transition: border-color 0.2s;
            position: relative;
        `;

        this.toolbar = this._createToolbar();
        this.element.appendChild(this.toolbar);

        const body = document.createElement('div');
        body.style.display = 'flex';
        this.body = body;

        // Execution Count Gutter
        this.gutter = document.createElement('div');
        this.gutter.className = 'cell-gutter';
        this.gutter.style.cssText = `
            width: 50px; flex-shrink: 0; background: #252526; color: #888;
            font-family: monospace; font-size: 0.85em; text-align: right; padding: 10px 5px;
            border-right: 1px solid #3c3c3c; user-select: none;
            cursor: move;
        `;
        this._updateGutter();
        body.appendChild(this.gutter);

        this.editorContainer = document.createElement('div');
        this.editorContainer.style.flex = '1';
        body.appendChild(this.editorContainer);

        this.element.appendChild(body);
        this.updateMode();

        return this.element;
    }

    _updateGutter() {
        if (this.gutter) {
            this.gutter.textContent = this.executionCount ? `[${this.executionCount}]` : '[ ]';
            if (this.executionCount) this.gutter.style.color = '#00ff9d';
        }
    }

    updateMode() {
        if (this.isCollapsed) {
            this.body.style.display = 'none';
            return;
        }
        this.body.style.display = 'flex';

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

        const trimmed = this.content.trim();
        const isMetta = trimmed.startsWith('(') || trimmed.startsWith(';') || trimmed.startsWith('!');
        const language = isMetta ? 'metta' : 'narsese';

        preview.innerHTML = NarseseHighlighter.highlight(this.content, language);
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
        const wrapper = document.createElement('div');
        wrapper.className = 'cell-toolbar';
        const tb = new Toolbar(wrapper, { style: 'display: flex; gap: 8px; align-items: center; padding: 4px 8px; background: #252526; border-bottom: 1px solid #3c3c3c;' });

        const label = document.createElement('span');
        label.textContent = '💻 Code';
        label.style.color = '#888';
        label.style.fontSize = '0.85em';
        tb.addCustom(label);

        tb.addButton({ label: '▶️', title: 'Run', primary: true, onClick: () => this.execute() });

        const toggleBtn = tb.addButton({
            label: this.isEditing ? '👁️' : '✏️',
            title: 'Toggle View',
            onClick: () => {
                this.isEditing = !this.isEditing;
                this.updateMode();
                toggleBtn.innerHTML = this.isEditing ? '👁️' : '✏️';
            }
        });

        const collapseBtn = tb.addButton({
            label: this.isCollapsed ? '🔽' : '🔼',
            title: 'Collapse/Expand',
            onClick: () => {
                this.isCollapsed = !this.isCollapsed;
                this.updateMode();
                collapseBtn.innerHTML = this.isCollapsed ? '🔽' : '🔼';
            }
        });

        tb.addButton({ label: '⬆️', title: 'Move Up', onClick: () => this.onMoveUp?.(this) });
        tb.addButton({ label: '⬇️', title: 'Move Down', onClick: () => this.onMoveDown?.(this) });
        tb.addButton({ label: '📑', title: 'Duplicate', onClick: () => this.onDuplicate?.(this) });
        tb.addButton({ label: '➕ Code', title: 'Insert Code Below', onClick: () => this.onInsertAfter?.('code') });
        tb.addButton({ label: '➕ Text', title: 'Insert Text Below', onClick: () => this.onInsertAfter?.('markdown') });

        // Time Label
        this.timeLabel = document.createElement('span');
        this.timeLabel.style.cssText = 'margin-left: auto; color: #666; font-size: 0.8em; font-family: monospace;';
        tb.addCustom(this.timeLabel);

        tb.addButton({ label: '🗑️', title: 'Delete', className: 'btn-danger', style: 'margin-left: 4px; background: #b30000; color: white; border: none;', onClick: () => this.delete() });

        return wrapper;
    }

    _createEditor() {
        const wrapper = document.createElement('div');
        this.smartEditor = new SmartTextarea(wrapper, {
            rows: Math.max(3, this.content.split('\n').length),
            autoResize: true,
            onExecute: (text, opts) => this.execute(opts ? { advance: opts.shiftKey } : {})
        });

        this.smartEditor.render();
        this.smartEditor.setValue(this.content);

        this.smartEditor.textarea.addEventListener('input', () => {
             this.content = this.smartEditor.getValue();
        });

        this.smartEditor.textarea.addEventListener('focus', () => this.element.style.borderColor = '#007acc');
        this.smartEditor.textarea.addEventListener('blur', () => this.element.style.borderColor = '#3c3c3c');

        return wrapper;
    }

    execute(options = {}) {
        if (this.onExecute && this.content.trim()) {
            this.isEditing = false;
            this.updateMode();

            // Timestamp
            const now = new Date();
            this.lastRunTime = now;
            if (this.timeLabel) {
                this.timeLabel.textContent = `Run at ${now.toLocaleTimeString()}`;
            }

            this.onExecute(this.content, this, options);
            this._updateGutter();
        }
    }

    delete() {
        Modal.confirm('Delete this cell?').then(yes => {
            if (yes) {
                this.destroy();
                this.onDelete?.(this);
            }
        });
    }

    focus() {
        this.smartEditor?.focus();
    }
}

/**
 * Prompt cell for system requests
 */
export class PromptCell extends REPLCell {
    constructor(question, onResponse = null) {
        super('prompt', question);
        this.onResponse = onResponse;
        this.response = '';
        this.responded = false;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell prompt-cell';
        this.element.style.cssText = `
            margin-bottom: 12px; border: 1px solid #00ff9d; border-radius: 4px;
            background: rgba(0, 255, 157, 0.05); overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'padding: 8px; background: rgba(0, 255, 157, 0.1); color: #00ff9d; font-weight: bold; font-size: 0.9em;';
        header.innerHTML = '🤖 System Request';

        const content = document.createElement('div');
        content.style.padding = '12px';

        const questionText = document.createElement('div');
        questionText.style.cssText = 'margin-bottom: 10px; font-size: 1.1em; color: white;';
        questionText.textContent = this.content;

        const inputContainer = document.createElement('div');
        inputContainer.style.display = 'flex';
        inputContainer.style.gap = '8px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Type your response here...';
        input.style.cssText = `
            flex: 1; background: #252526; border: 1px solid #444; color: white;
            padding: 8px; border-radius: 3px; outline: none;
        `;

        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Reply';
        submitBtn.style.cssText = `
            padding: 8px 16px; background: #00ff9d; color: black; border: none;
            border-radius: 3px; cursor: pointer; font-weight: bold;
        `;

        const submit = () => {
            if (!input.value.trim() || this.responded) return;
            this.response = input.value.trim();
            this.responded = true;
            input.disabled = true;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sent';
            this.onResponse?.(this.response);
        };

        submitBtn.onclick = submit;
        input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };

        inputContainer.append(input, submitBtn);
        content.append(questionText, inputContainer);
        this.element.append(header, content);

        requestAnimationFrame(() => input.focus());

        return this.element;
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
        this.element.draggable = true;

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
        this.element.innerHTML = '';
        this.element.onclick = () => this.updateViewMode(VIEW_MODES.FULL);
        this.element.title = "Click to expand";

        if (this.category === 'concept' && typeof this.content === 'object') {
            this.element.style.cssText = 'margin-bottom: 1px;';
            new ConceptCard(this.element, this.content, { compact: true }).render();
            return;
        }
        if (this.category === 'task' && typeof this.content === 'object') {
            this.element.style.cssText = 'margin-bottom: 1px;';
            new TaskCard(this.element, this.content, { compact: true }).render();
            return;
        }

        this.element.style.cssText = `
            margin-bottom: 2px; padding: 2px 6px; border-left: 3px solid ${color};
            background: rgba(0,0,0,0.2); border-radius: 2px; display: flex;
            align-items: center; gap: 8px; cursor: pointer; font-size: 0.85em;
        `;

        const badge = document.createElement('span');
        badge.style.color = color;
        badge.innerHTML = `${catInfo.icon || '✨'}`;

        const preview = document.createElement('span');
        preview.style.cssText = 'color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; opacity: 0.8;';

        let previewText = '';
        if (typeof this.content === 'string') {
            previewText = this.content;
        } else {
            previewText = JSON.stringify(this.content);
        }

        if (previewText.length > 120) previewText = previewText.substring(0, 120) + '...';

        if (this.category === 'reasoning') {
             preview.innerHTML = previewText.replace(/(\w+)(\:)/, '<span style="color:#00d4ff">$1</span>$2');
        } else {
             preview.textContent = previewText;
        }

        this.element.append(badge, preview);
    }

    _renderFull(catInfo, color) {
        this.element.onclick = null;
        this.element.innerHTML = '';

        const actions = this._createActionsToolbar(catInfo);
        this.element.appendChild(actions);

        if ((this.category === 'concept' || this.category === 'task') && typeof this.content === 'object') {
            this.element.style.cssText = 'margin-bottom: 8px; position: relative;';
            const cardWrapper = document.createElement('div');
            if (this.category === 'concept') new ConceptCard(cardWrapper, this.content).render();
            else new TaskCard(cardWrapper, this.content).render();
            this.element.appendChild(cardWrapper);
            return;
        }

        this.element.style.cssText = `
            margin-bottom: 8px; padding: 8px; border-left: 3px solid ${color};
            background: rgba(255, 255, 255, 0.03); border-radius: 4px; position: relative;
        `;

        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'white-space: pre-wrap; font-family: monospace; color: #d4d4d4; overflow-x: auto; font-size: 0.95em;';

        if (typeof this.content === 'string') {
            contentDiv.innerHTML = NarseseHighlighter.highlight(this.content);
        } else if (this.category === 'derivation') {
             contentDiv.innerHTML = `<div style="padding:10px; border:1px dashed #444; text-align:center;">🌲 Derivation Tree Visualization (Coming Soon)</div>`;
             const raw = document.createElement('pre');
             raw.textContent = JSON.stringify(this.content, null, 2);
             contentDiv.appendChild(raw);
        } else {
            contentDiv.textContent = JSON.stringify(this.content, null, 2);
        }

        this.element.appendChild(contentDiv);
    }

    _createActionsToolbar(catInfo) {
        const actions = document.createElement('div');
        actions.className = 'cell-actions';
        actions.style.cssText = `
            position: absolute; top: 4px; right: 4px; opacity: 0; transition: opacity 0.2s;
            display: flex; gap: 6px; background: rgba(0,0,0,0.5); padding: 2px 4px; border-radius: 3px; z-index: 10;
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
            Modal.alert(`Type: ${catInfo.label}<br>Time: ${new Date(this.timestamp).toLocaleString()}<br>Category: ${this.category}`, 'Cell Info');
        });

        actions.append(copyBtn, infoBtn, collapseBtn);
        return actions;
    }
}

/**
 * Markdown cell for documentation
 */
export class MarkdownCell extends REPLCell {
    constructor(content = '') {
        super('markdown', content);
        this.isEditing = false;
        this.onUpdate = null;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell markdown-cell';
        this.element.dataset.cellId = this.id;
        this.element.draggable = true;
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
        this.element.draggable = true;
        this.element.style.cssText = 'margin-bottom: 12px; border: 1px solid #333; background: #1e1e1e; border-radius: 4px; padding: 10px;';

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; cursor: move;';
        header.innerHTML = `<span>🧩 ${this.widgetType}</span>`;

        const closeBtn = this._createActionBtn('✖️', 'Remove', () => this.destroy());
        header.appendChild(closeBtn);

        const content = document.createElement('div');
        content.style.position = 'relative';

        this.element.append(header, content);

        if (this.widgetType === 'SubNotebook') {
             const nestedManager = new NotebookManager(content, {
                 onExecute: (text, cell, options) => {
                     console.log('Nested execution:', text);
                 }
             });
             this.widgetInstance = nestedManager;
             nestedManager.createCodeCell('(print "Hello Nested World")');
        } else {
            let config = this.content;
            if (this.widgetType === 'TruthSlider') {
                config = {
                    frequency: this.content.frequency,
                    confidence: this.content.confidence,
                    onChange: (val) => console.log('Widget update:', val)
                };
            }

            this.widgetInstance = WidgetFactory.createWidget(this.widgetType, content, config);

            if (this.widgetInstance) {
                this.widgetInstance.render();
            } else {
                content.innerHTML = `<div style="color:red">Unknown widget: ${this.widgetType}</div>`;
            }
        }

        return this.element;
    }
}

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
            if (data.length > 500) data.splice(0, data.length - 500);
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
