import { CommandHistory } from './CommandHistory.js';
import { SmartTextarea } from './SmartTextarea.js';

export class REPLInput {
    constructor(container, options = {}) {
        this.container = container;
        this.onExecute = options.onExecute || (() => {});
        this.onClear = options.onClear || (() => {});
        this.onDemo = options.onDemo || (() => {});
        this.onExtraAction = options.onExtraAction || (() => {});
        this.onControl = options.onControl || (() => {});

        this.history = new CommandHistory();
        this.element = null;
        this.inputBox = null; // Will refer to SmartTextarea instance or element
        this.controls = {};
        this.isRunning = false;
        this.cycleCount = 0;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-input-area';
        this.element.style.cssText = 'padding: 10px; background: #252526; border-top: 1px solid #333; display: flex; flex-direction: column; gap: 8px;';

        // Reasoner Controls (Top Bar)
        const controlBar = this._createControlBar();
        this.element.appendChild(controlBar);

        // Input Box (SmartTextarea)
        const inputContainer = document.createElement('div');
        this.smartInput = new SmartTextarea(inputContainer, {
            onExecute: () => this.execute()
        });
        this.smartInput.render();
        this.inputBox = this.smartInput; // Use wrapper for history access compatibility

        // Event Listeners for history
        this.smartInput.textarea.addEventListener('keydown', (e) => this._handleKeydown(e));

        // Bottom Toolbar (Run, Demo, Widgets)
        const toolbar = this._createBottomToolbar();

        this.element.appendChild(inputContainer);
        this.element.appendChild(toolbar);

        if (this.container) {
            this.container.innerHTML = '';
            this.container.appendChild(this.element);
        }

        return this.element;
    }

    _createControlBar() {
        const bar = document.createElement('div');
        bar.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 4px;';

        const btnStyle = `padding: 4px 8px; background: #333; color: #fff; border: 1px solid #444; cursor: pointer; border-radius: 3px; font-size: 11px; display: flex; align-items: center; gap: 4px;`;

        this.controls.playPause = document.createElement('button');
        this.controls.playPause.innerHTML = '▶️ Run';
        this.controls.playPause.style.cssText = btnStyle;
        this.controls.playPause.onclick = () => this.onControl(this.isRunning ? 'stop' : 'start');

        this.controls.step = document.createElement('button');
        this.controls.step.innerHTML = '⏭️ Step';
        this.controls.step.style.cssText = btnStyle;
        this.controls.step.onclick = () => this.onControl('step');

        this.controls.reset = document.createElement('button');
        this.controls.reset.innerHTML = '🔄 Reset';
        this.controls.reset.style.cssText = btnStyle;
        this.controls.reset.onclick = () => confirm('Reset Memory?') && this.onControl('reset');

        this.controls.cycleDisplay = document.createElement('span');
        this.controls.cycleDisplay.style.cssText = 'margin-left: auto; font-family: monospace; font-size: 11px; color: #888;';
        this.controls.cycleDisplay.textContent = 'Cycles: 0';

        bar.append(this.controls.playPause, this.controls.step, this.controls.reset, this.controls.cycleDisplay);
        return bar;
    }

    _createBottomToolbar() {
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display: flex; gap: 8px; align-items: center; flex-wrap: wrap;';

        const runBtn = this._createButton('▶️ Execute (Shift+Enter)', '#0e639c', () => this.execute());
        const clearBtn = this._createButton('🗑️ Clear', '#333', () => this.onClear());
        const demoBtn = this._createButton('📚 Load Demo', '#5c2d91', () => this.onDemo());
        demoBtn.title = 'Browse demo library (Ctrl+Shift+D)';

        const extraTools = document.createElement('div');
        extraTools.style.cssText = 'display: flex; gap: 4px; border-left: 1px solid #444; padding-left: 12px; margin-left: auto;';

        const addMdBtn = this._createButton('📝 Text', '#333', () => this.onExtraAction('markdown'));
        const addSliderBtn = this._createButton('🎚️ Slider', '#333', () => this.onExtraAction('slider'));
        const addSubNbBtn = this._createButton('📂 Sub-Notebook', '#333', () => this.onExtraAction('subnotebook'));

        extraTools.append(addMdBtn, addSliderBtn, addSubNbBtn);
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

    updateState(isRunning) {
        this.isRunning = isRunning;
        if (this.controls.playPause) {
            this.controls.playPause.innerHTML = isRunning ? '⏸️ Pause' : '▶️ Run';
            this.controls.playPause.style.background = isRunning ? '#8f6e00' : '#333';
        }
        if (this.controls.step) {
            this.controls.step.disabled = isRunning;
            this.controls.step.style.opacity = isRunning ? 0.5 : 1;
        }
    }

    updateCycles(count) {
        this.cycleCount = count;
        if (this.controls.cycleDisplay) {
            this.controls.cycleDisplay.textContent = `Cycles: ${count}`;
        }
    }

    _handleKeydown(e) {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            this.execute();
        } else if (e.key === 'ArrowUp') {
            if (this.inputBox.selectionStart === 0 && this.inputBox.selectionEnd === 0) {
                const prev = this.history.getPrevious(this.inputBox.getValue());
                if (prev !== null) {
                    e.preventDefault();
                    this.inputBox.setValue(prev);
                    this.inputBox.setSelectionRange(0, 0);
                }
            }
        } else if (e.key === 'ArrowDown') {
            if (this.inputBox.selectionStart === this.inputBox.getValue().length) {
                const next = this.history.getNext();
                if (next !== null) {
                    e.preventDefault();
                    this.inputBox.setValue(next);
                }
            }
        }
    }

    execute() {
        const content = this.inputBox.getValue().trim();
        if (!content) return;
        this.history.add(content);
        this.onExecute(content);
        this.inputBox.setValue('');

        // Auto-scroll to bottom of notebook when executing from REPL input
        // This is a bit of a hack reaching into DOM, but simple
        const notebook = document.getElementById('repl-notebook');
        if (notebook) {
            setTimeout(() => notebook.scrollTop = notebook.scrollHeight, 100);
        }
    }

    setValue(value) {
        if (this.inputBox) this.inputBox.setValue(value);
    }

    focus() {
        this.inputBox?.focus();
    }
}
