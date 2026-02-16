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
        inputContainer.style.position = 'relative'; // For badge positioning

        this.smartInput = new SmartTextarea(inputContainer, {
            onExecute: () => this.execute()
        });
        this.smartInput.render();
        this.inputBox = this.smartInput;

        // Mode Badge
        this.modeBadge = document.createElement('div');
        this.modeBadge.style.cssText = `
            position: absolute; bottom: 8px; right: 8px; z-index: 10;
            font-size: 10px; color: rgba(255,255,255,0.3); font-family: monospace;
            background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 3px;
            pointer-events: none; transition: opacity 0.2s;
        `;
        this.modeBadge.textContent = 'NARS';
        inputContainer.appendChild(this.modeBadge);

        // Event Listeners for history & mode update
        this.smartInput.textarea.addEventListener('keydown', (e) => this._handleKeydown(e));
        this.smartInput.textarea.addEventListener('input', () => this._updateModeBadge());

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

        const helpBtn = this._createButton('❓', '#333', () => this._showHelp());
        helpBtn.title = 'Keyboard Shortcuts (F1)';

        const extraTools = document.createElement('div');
        extraTools.style.cssText = 'display: flex; gap: 4px; border-left: 1px solid #444; padding-left: 12px; margin-left: auto;';

        const addMdBtn = this._createButton('📝 Text', '#333', () => this.onExtraAction('markdown'));
        const addSliderBtn = this._createButton('🎚️ Slider', '#333', () => this.onExtraAction('slider'));
        const addSubNbBtn = this._createButton('📂 Sub-Notebook', '#333', () => this.onExtraAction('subnotebook'));

        extraTools.append(addMdBtn, addSliderBtn, addSubNbBtn);
        toolbar.append(runBtn, clearBtn, demoBtn, helpBtn, extraTools);
        return toolbar;
    }

    _showHelp() {
        const shortcuts = [
            { key: 'Ctrl + Enter', desc: 'Execute current cell' },
            { key: 'Shift + Enter', desc: 'Execute and advance' },
            { key: 'Up / Down', desc: 'Navigate history (when empty)' },
            { key: 'Ctrl + L', desc: 'Clear console' },
            { key: 'F1', desc: 'Show this help' }
        ];

        const content = shortcuts.map(s => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px;">
                <span style="font-family: monospace; color: #00ff9d; background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px;">${s.key}</span>
                <span style="color: #ccc;">${s.desc}</span>
            </div>
        `).join('');

        // Simple modal using alert for now, or create a temporary element
        // Since we want to be fancy, let's inject a div
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #252526; border: 1px solid #444; padding: 20px; border-radius: 6px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 10000; min-width: 300px;
        `;

        modal.innerHTML = `
            <h3 style="margin-top: 0; color: #fff; border-bottom: 1px solid #444; padding-bottom: 10px;">⌨️ Keyboard Shortcuts</h3>
            <div style="margin: 15px 0;">${content}</div>
            <div style="text-align: right;">
                <button id="close-help-btn" style="padding: 6px 12px; background: #0e639c; color: white; border: none; border-radius: 3px; cursor: pointer;">Close</button>
            </div>
        `;

        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 9999;
        `;

        const close = () => {
            modal.remove();
            backdrop.remove();
        };

        backdrop.onclick = close;
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        modal.querySelector('#close-help-btn').onclick = close;
    }

    _createButton(label, bg, onClick) {
        return REPLInput.createButton(label, bg, onClick);
    }

    static createButton(label, bg, onClick) {
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

    _updateModeBadge() {
        const text = this.inputBox.getValue().trim();
        const isMetta = text.startsWith('(') || text.startsWith(';') || text.startsWith('!');
        this.modeBadge.textContent = isMetta ? 'MeTTa' : 'NARS';
        this.modeBadge.style.color = isMetta ? 'var(--metta-keyword, #c586c0)' : 'var(--nars-structure, #888)';
        this.modeBadge.style.opacity = text.length > 0 ? 1 : 0.3;
    }

    _handleKeydown(e) {
        if (e.key === 'F1') {
            e.preventDefault();
            this._showHelp();
            return;
        }

        if (e.ctrlKey && e.key === 'l') {
             e.preventDefault();
             this.onClear();
             return;
        }

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
