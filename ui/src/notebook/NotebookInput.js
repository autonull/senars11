import { CommandHistory } from './CommandHistory.js';
import { SmartTextarea } from './SmartTextarea.js';
import { Modal } from '../components/ui/Modal.js';
import { FluentToolbar } from '../components/ui/FluentToolbar.js';
import { Config } from '../config/Config.js';
import { FluentUI } from '../utils/FluentUI.js';

export class NotebookInput {
    constructor(container, options = {}) {
        this.container = container;
        this.onExecute = options.onExecute ?? (() => {});
        this.onClear = options.onClear ?? (() => {});
        this.onDemo = options.onDemo ?? (() => {});
        this.onExtraAction = options.onExtraAction ?? (() => {});
        this.onControl = options.onControl ?? (() => {});

        this.history = new CommandHistory('senars-repl-history', Config.getConstants().MAX_HISTORY_SIZE);
        this.element = null;
        this.inputBox = null;
        this.controls = {};
        this.isRunning = false;
        this.cycleCount = 0;
    }

    render() {
        this.element = FluentUI.create('div')
            .class('notebook-input-area')
            .style({ padding: '10px', background: '#252526', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px' });

        // Reasoner Controls (Top Bar)
        this.element.child(this._createControlBar());

        // Input Box (SmartTextarea)
        const inputContainer = FluentUI.create('div').style({ position: 'relative' });

        this.smartInput = new SmartTextarea(inputContainer.dom, {
            onExecute: () => this.execute()
        });
        this.smartInput.render();
        this.inputBox = this.smartInput;

        // Mode Badge
        this.modeBadge = FluentUI.create('div')
            .style({
                position: 'absolute', bottom: '8px', right: '8px', zIndex: '10',
                fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace',
                background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '3px',
                pointerEvents: 'none', transition: 'opacity 0.2s'
            })
            .text('NARS')
            .mount(inputContainer);

        this.smartInput.textarea.addEventListener('keydown', (e) => this._handleKeydown(e));
        this.smartInput.textarea.addEventListener('input', () => this._updateModeBadge());

        this.element.child(inputContainer);

        // Bottom Toolbar
        this.element.child(this._createBottomToolbar());

        if (this.container) {
            this.container.innerHTML = '';
            this.container.appendChild(this.element.dom);
        }

        return this.element.dom;
    }

    _createControlBar() {
        const wrapper = FluentUI.create('div');

        // Note: FluentToolbar currently expects a config array, not a builder style.
        // We will adapt the configuration to match the FluentToolbar API.

        const config = [
            {
                type: 'group',
                style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', background: 'transparent', padding: '0' },
                items: [
                    {
                        type: 'button',
                        label: '▶️ Run',
                        onClick: (e) => this.onControl(this.isRunning ? 'stop' : 'start'),
                        renderer: (btn) => { this.controls.playPause = btn; } // Helper to capture ref? No, FluentToolbar doesn't support this yet.
                    },
                    {
                        type: 'button',
                        label: '⏭️ Step',
                        onClick: () => this.onControl('step'),
                        // ref capture workaround
                    },
                    {
                        type: 'button',
                        label: '🔄 Reset',
                        onClick: () => Modal.confirm('Reset Memory?').then(yes => yes && this.onControl('reset'))
                    },
                    {
                        type: 'custom',
                        renderer: () => {
                            this.controls.cycleDisplay = FluentUI.create('span')
                                .style({ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '11px', color: '#888' })
                                .text('Cycles: 0')
                                .dom;
                            return this.controls.cycleDisplay;
                        }
                    }
                ]
            }
        ];

        // We need to capture button references for state updates.
        // The declarative toolbar makes this harder unless we add IDs or refs.
        // For now, let's use a simpler custom rendering or stick to FluentUI for this specific dynamic bar.

        // Alternative: Use FluentUI directly for fine-grained control
        const bar = FluentUI.create('div').style({ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' });

        this.controls.playPause = FluentUI.create('button').class('toolbar-btn').text('▶️ Run').on('click', () => this.onControl(this.isRunning ? 'stop' : 'start')).dom;
        this.controls.step = FluentUI.create('button').class('toolbar-btn').text('⏭️ Step').on('click', () => this.onControl('step')).dom;
        this.controls.reset = FluentUI.create('button').class('toolbar-btn').text('🔄 Reset').on('click', () => Modal.confirm('Reset Memory?').then(yes => yes && this.onControl('reset'))).dom;
        this.controls.cycleDisplay = FluentUI.create('span').style({ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '11px', color: '#888' }).text('Cycles: 0').dom;

        bar.child(this.controls.playPause).child(this.controls.step).child(this.controls.reset).child(this.controls.cycleDisplay);

        return bar;
    }

    _createBottomToolbar() {
        const config = [
            {
                type: 'group',
                style: { display: 'flex', gap: '8px', alignItems: 'center', background: 'transparent', padding: '0' },
                items: [
                    { type: 'button', label: '▶️ Execute (Shift+Enter)', class: 'primary', onClick: () => this.execute() },
                    { type: 'button', label: '🗑️ Clear', onClick: () => this.onClear() },
                    { type: 'button', label: '📚 Load Demo', onClick: () => this.onDemo(), title: 'Browse demo library (Ctrl+Shift+D)' },
                    { type: 'button', label: '❓', onClick: () => this._showHelp(), title: 'Keyboard Shortcuts (F1)' },
                    { type: 'custom', renderer: () => FluentUI.create('div').style({ flex: '1' }).dom },
                    { type: 'button', label: '📝 Text', onClick: () => this.onExtraAction('markdown') },
                    { type: 'button', label: '🎚️ Slider', onClick: () => this.onExtraAction('slider') },
                    { type: 'button', label: '📂 Sub-Notebook', onClick: () => this.onExtraAction('subnotebook') }
                ]
            }
        ];

        const wrapper = FluentUI.create('div');
        new FluentToolbar(wrapper.dom, config).render();
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
        this.modeBadge.text(isMetta ? 'MeTTa' : 'NARS');
        this.modeBadge.style({ color: isMetta ? 'var(--metta-keyword, #c586c0)' : 'var(--nars-structure, #888)', opacity: text.length > 0 ? 1 : 0.3 });
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
            this._handleHistoryNav('up', e);
        } else if (e.key === 'ArrowDown') {
            this._handleHistoryNav('down', e);
        }
    }

    _handleHistoryNav(direction, e) {
        const isUp = direction === 'up';
        const atStart = this.inputBox.selectionStart === 0 && this.inputBox.selectionEnd === 0;
        const atEnd = this.inputBox.selectionStart === this.inputBox.getValue().length;

        if ((isUp && atStart) || (!isUp && atEnd)) {
            const nextVal = isUp
                ? this.history.getPrevious(this.inputBox.getValue())
                : this.history.getNext();

            if (nextVal !== null) {
                e.preventDefault();
                this.inputBox.setValue(nextVal);
                if (isUp) this.inputBox.setSelectionRange(0, 0);
            }
        }
    }

    execute() {
        const content = this.inputBox.getValue().trim();
        if (!content) return;
        this.history.add(content);
        this.onExecute(content);
        this.inputBox.setValue('');

        const notebook = document.querySelector('.notebook-container'); // Changed from ID repl-notebook
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
