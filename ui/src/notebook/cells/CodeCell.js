import { Cell } from './Cell.js';
import { Toolbar } from '../../components/ui/Toolbar.js';
import { SmartTextarea } from '../SmartTextarea.js';
import { NarseseHighlighter } from '../../utils/NarseseHighlighter.js';
import { Modal } from '../../components/ui/Modal.js';
import { FluentUI } from '../../utils/FluentUI.js';

/**
 * Code cell for user input
 */
export class CodeCell extends Cell {
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
        const wrapper = FluentUI.create('div')
            .class('repl-cell code-cell')
            .data('cellId', this.id)
            .attr({ draggable: 'true' })
            .style({
                marginBottom: '12px',
                border: '1px solid #3c3c3c',
                borderRadius: '4px',
                background: '#1e1e1e',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
                position: 'relative'
            });

        this.element = wrapper.dom;
        this.toolbar = this._createToolbar();
        wrapper.child(this.toolbar);

        const body = FluentUI.create('div').style({ display: 'flex' });
        this.body = body.dom;

        // Execution Count Gutter
        this.gutter = FluentUI.create('div')
            .class('cell-gutter')
            .style({
                width: '50px', flexShrink: '0', background: '#252526', color: '#888',
                fontFamily: 'monospace', fontSize: '0.85em', textAlign: 'right', padding: '10px 5px',
                borderRight: '1px solid #3c3c3c', userSelect: 'none', cursor: 'move'
            })
            .dom;

        this._updateGutter();
        body.child(this.gutter);

        this.editorContainer = FluentUI.create('div').style({ flex: '1' }).dom;
        body.child(this.editorContainer);

        wrapper.child(body);
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
        if (!this.body) return;

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
        const trimmed = this.content.trim();
        const isMetta = trimmed.startsWith('(') || trimmed.startsWith(';') || trimmed.startsWith('!');
        const language = isMetta ? 'metta' : 'narsese';

        return FluentUI.create('div')
            .class('code-preview')
            .html(NarseseHighlighter.highlight(this.content, language))
            .style({
                padding: '10px', fontFamily: 'monospace', fontSize: '0.95em',
                color: '#d4d4d4', whiteSpace: 'pre-wrap', cursor: 'pointer',
                borderLeft: '2px solid transparent'
            })
            .attr({ title: 'Double-click to edit' })
            .on('dblclick', () => {
                this.isEditing = true;
                this.updateMode();
            })
            .dom;
    }

    _createToolbar() {
        const wrapper = FluentUI.create('div').class('cell-toolbar').dom;
        const tb = new Toolbar(wrapper, { style: 'display: flex; gap: 4px; align-items: center; padding: 2px 4px; background: #252526; border-bottom: 1px solid #333; height: 28px;' });

        tb.addButton({ label: '▶️', title: 'Run (Shift+Enter)', primary: true, style: 'padding: 0 8px;', onClick: () => this.execute() });

        tb.addCustom(FluentUI.create('span')
            .text('CODE')
            .style({ color: '#555', fontSize: '0.7em', fontWeight: 'bold', marginLeft: '4px', fontFamily: 'monospace' })
            .dom);

        tb.addCustom(FluentUI.create('div').style({ flex: '1' }).dom);

        this.timeLabel = FluentUI.create('span')
            .style({ color: '#555', fontSize: '0.8em', fontFamily: 'monospace', marginRight: '8px' })
            .dom;
        tb.addCustom(this.timeLabel);

        this._addSecondaryActions(wrapper);

        return wrapper;
    }

    _addSecondaryActions(wrapper) {
        this._addToolbarButton(wrapper, '⬆️', 'Move Up', () => this.onMoveUp?.(this));
        this._addToolbarButton(wrapper, '⬇️', 'Move Down', () => this.onMoveDown?.(this));
        this._addToolbarButton(wrapper, '➕', 'Insert Code', () => this.onInsertAfter?.('code'));
        this._addToolbarButton(wrapper, '📑', 'Duplicate Cell', () => this.onDuplicate?.(this));

        const delBtn = this._addToolbarButton(wrapper, '✕', 'Delete Cell', () => this.delete());
        delBtn.style.color = '#ff4444';
        delBtn.onmouseover = (e) => { e.target.style.background = '#b30000'; e.target.style.color = '#fff'; };
        delBtn.onmouseout = (e) => { e.target.style.background = 'transparent'; e.target.style.color = '#ff4444'; };
    }

    _addToolbarButton(wrapper, icon, title, action) {
        const btn = FluentUI.create('button')
            .text(icon)
            .attr({ title })
            .style({
                padding: '2px 4px', fontSize: '12px', background: 'transparent',
                border: 'none', color: '#888', cursor: 'pointer'
            })
            .on('click', action)
            .on('mouseover', (e) => { e.target.style.color = '#fff'; e.target.style.background = '#333'; })
            .on('mouseout', (e) => { e.target.style.color = '#888'; e.target.style.background = 'transparent'; })
            .mount(wrapper);
        return btn.dom;
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

        this.smartEditor.textarea.addEventListener('keydown', (e) => {
            if (e.shiftKey && e.key === 'Delete') {
                e.preventDefault();
                this.delete();
            }
        });

        return wrapper;
    }

    execute(options = {}) {
        if (this.onExecute && this.content.trim()) {
            this.isEditing = false;
            this.updateMode();

            // Timestamp and duration (start)
            this.startTime = Date.now();
            const now = new Date();
            this.lastRunTime = now;
            if (this.timeLabel) {
                this.timeLabel.textContent = `Run at ${now.toLocaleTimeString()}`;
            }

            this.onExecute(this.content, this, options);
            this._updateGutter();

            // Note: End time and duration would technically be set when execution finishes,
            // but since onExecute is async or event-based, we might just show start time
            // or need a callback for completion. For now, just timestamp is fine.
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
