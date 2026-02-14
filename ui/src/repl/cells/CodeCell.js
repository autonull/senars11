import { REPLCell } from './REPLCell.js';
import { Toolbar } from '../../components/ui/Toolbar.js';
import { SmartTextarea } from '../SmartTextarea.js';
import { NarseseHighlighter } from '../../utils/NarseseHighlighter.js';
import { Modal } from '../../components/ui/Modal.js';

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
