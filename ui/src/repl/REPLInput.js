import { CommandHistory } from './CommandHistory.js';
import { SmartTextarea } from './SmartTextarea.js';
import { Modal } from '../components/ui/Modal.js';
import { Toolbar } from '../components/ui/Toolbar.js';

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
        this.inputBox = null;
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
        inputContainer.style.position = 'relative';

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

        this.smartInput.textarea.addEventListener('keydown', (e) => this._handleKeydown(e));
        this.smartInput.textarea.addEventListener('input', () => this._updateModeBadge());

        // Bottom Toolbar
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
        const wrapper = document.createElement('div');
        const tb = new Toolbar(wrapper, { style: 'display: flex; gap: 6px; align-items: center; margin-bottom: 4px; background: transparent; padding: 0;' });

        this.controls.playPause = tb.addButton({
            label: '▶️ Run',
            onClick: () => this.onControl(this.isRunning ? 'stop' : 'start')
        });

        this.controls.step = tb.addButton({
            label: '⏭️ Step',
            onClick: () => this.onControl('step')
        });

        this.controls.reset = tb.addButton({
            label: '🔄 Reset',
            onClick: () => Modal.confirm('Reset Memory?').then(yes => yes && this.onControl('reset'))
        });

        this.controls.cycleDisplay = document.createElement('span');
        this.controls.cycleDisplay.style.cssText = 'margin-left: auto; font-family: monospace; font-size: 11px; color: #888;';
        this.controls.cycleDisplay.textContent = 'Cycles: 0';

        wrapper.firstChild.appendChild(this.controls.cycleDisplay); // Append to toolbar div

        return wrapper;
    }

    _createBottomToolbar() {
        const wrapper = document.createElement('div');
        const tb = new Toolbar(wrapper, { style: 'display: flex; gap: 8px; align-items: center; background: transparent; padding: 0;' });

        tb.addButton({ label: '▶️ Execute (Shift+Enter)', primary: true, onClick: () => this.execute() });
        tb.addButton({ label: '🗑️ Clear', onClick: () => this.onClear() });
        tb.addButton({ label: '📚 Load Demo', onClick: () => this.onDemo(), title: 'Browse demo library (Ctrl+Shift+D)' });
        tb.addButton({ label: '❓', onClick: () => this._showHelp(), title: 'Keyboard Shortcuts (F1)' });

        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        tb.addCustom(spacer);

        tb.addButton({ label: '📝 Text', onClick: () => this.onExtraAction('markdown') });
        tb.addButton({ label: '🎚️ Slider', onClick: () => this.onExtraAction('slider') });
        tb.addButton({ label: '📂 Sub-Notebook', onClick: () => this.onExtraAction('subnotebook') });

        return wrapper;
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

        const modal = new Modal({
            title: '⌨️ Keyboard Shortcuts',
            content: content,
            width: '400px'
        });
        modal.show();
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
