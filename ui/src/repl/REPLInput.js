import { CommandHistory } from './CommandHistory.js';

export class REPLInput {
    constructor(container, options = {}) {
        this.container = container;
        this.onExecute = options.onExecute || (() => {});
        this.onClear = options.onClear || (() => {});
        this.onDemo = options.onDemo || (() => {});
        this.onExtraAction = options.onExtraAction || (() => {});

        this.history = new CommandHistory();
        this.element = null;
        this.inputBox = null;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-input-area';
        this.element.style.cssText = 'padding: 10px; background: #252526; border-top: 1px solid #333; display: flex; flex-direction: column; gap: 8px;';

        // Input Box
        this.inputBox = document.createElement('textarea');
        this.inputBox.id = 'repl-input';
        this.inputBox.placeholder = 'Enter Narsese or MeTTa... (Ctrl+Enter to Run)';
        this.inputBox.rows = 3;
        this.inputBox.style.cssText = `
            width: 100%;
            background: #1e1e1e;
            color: #d4d4d4;
            border: 1px solid #3c3c3c;
            padding: 8px;
            font-family: monospace;
            resize: vertical;
            outline: none;
            border-radius: 2px;
        `;

        // Focus style
        this.inputBox.addEventListener('focus', () => this.inputBox.style.borderColor = '#0e639c');
        this.inputBox.addEventListener('blur', () => this.inputBox.style.borderColor = '#3c3c3c');

        // Event Listeners
        this.inputBox.addEventListener('keydown', (e) => this._handleKeydown(e));

        // Toolbar
        const toolbar = this._createToolbar();

        this.element.appendChild(this.inputBox);
        this.element.appendChild(toolbar);

        if (this.container) {
            this.container.innerHTML = '';
            this.container.appendChild(this.element);
        }

        return this.element;
    }

    _handleKeydown(e) {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            this.execute();
        } else if (e.key === 'ArrowUp') {
            // Only if cursor is at start of first line to avoid messing with multiline editing
            if (this.inputBox.selectionStart === 0 && this.inputBox.selectionEnd === 0) {
                const prev = this.history.getPrevious(this.inputBox.value);
                if (prev !== null) {
                    e.preventDefault();
                    this.inputBox.value = prev;
                    // Keep cursor at start to allow rapid history cycling
                    this.inputBox.setSelectionRange(0, 0);
                }
            }
        } else if (e.key === 'ArrowDown') {
            if (this.inputBox.selectionStart === this.inputBox.value.length) {
                const next = this.history.getNext();
                if (next !== null) {
                    e.preventDefault();
                    this.inputBox.value = next;
                }
            }
        }
    }

    _createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display: flex; gap: 8px; align-items: center; flex-wrap: wrap;';

        const runBtn = this._createButton('▶️ Run (Ctrl+Enter)', '#0e639c', () => this.execute());
        const clearBtn = this._createButton('🗑️ Clear', '#333', () => this.onClear());
        const demoBtn = this._createButton('📚 Load Demo', '#5c2d91', () => this.onDemo());
        demoBtn.title = 'Browse demo library (Ctrl+Shift+D)';

        // Extra tools container
        const extraTools = document.createElement('div');
        extraTools.style.cssText = 'display: flex; gap: 4px; border-left: 1px solid #444; padding-left: 12px; margin-left: auto;';

        const addMdBtn = this._createButton('📝 Text', '#333', () => this.onExtraAction('markdown'));
        addMdBtn.title = 'Add Markdown Cell';

        const addGraphBtn = this._createButton('🧩 Graph', '#333', () => this.onExtraAction('graph'));
        addGraphBtn.title = 'Add Graph Widget';

        const addSliderBtn = this._createButton('🎚️ Slider', '#333', () => this.onExtraAction('slider'));
        addSliderBtn.title = 'Add Truth Slider';

        const simBtn = this._createButton('⚡ Simulation', '#00ff9d', () => this.onExtraAction('simulation'));
        simBtn.style.color = '#000';
        simBtn.style.fontWeight = 'bold';
        simBtn.title = 'Run Epic Simulation';

        extraTools.append(addMdBtn, addGraphBtn, addSliderBtn, simBtn);

        toolbar.append(runBtn, clearBtn, demoBtn, extraTools);
        return toolbar;
    }

    _createButton(label, bg, onClick) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.onclick = onClick;
        btn.style.cssText = `
            padding: 6px 12px;
            background: ${bg};
            color: white;
            border: none;
            cursor: pointer;
            border-radius: 3px;
            font-size: 11px;
            font-family: inherit;
        `;
        return btn;
    }

    execute() {
        const content = this.inputBox.value.trim();
        if (!content) return;

        this.history.add(content);
        this.onExecute(content);
        this.inputBox.value = '';
        // Need to reset pointer?
        // CommandHistory.add() resets pointer to end.
    }

    setValue(value) {
        if (this.inputBox) this.inputBox.value = value;
    }

    focus() {
        this.inputBox?.focus();
    }
}
