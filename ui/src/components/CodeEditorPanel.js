import { Component } from './Component.js';
import { SmartTextarea } from '../notebook/SmartTextarea.js';
import { FluentUI, $ } from '../utils/FluentUI.js';
import { ReactiveState } from '../core/ReactiveState.js';

export class CodeEditorPanel extends Component {
    constructor(container) {
        super(container);
        this.app = null;
        this.editor = null;
        this.demoSelect = null;
        this.langSelect = null;

        this.state = new ReactiveState({
            autoRun: false,
            language: 'metta'
        });

        this._disposables = [];
    }

    initialize(app) {
        this.app = app;
        this.render();
    }

    render() {
        if (!this.container) return;

        try {
            $(this.container).clear().class('code-editor-panel');
        } catch (e) {
            console.error('FluentUI error:', e);
        }

        // Toolbar
        const toolbar = $('div')
            .class('editor-toolbar')
            .style({ padding: '5px', background: '#252526', borderBottom: '1px solid #333', display: 'flex', gap: '8px', alignItems: 'center' })
            .mount(this.container);

        $('button')
            .text('▶️ Run')
            .class('btn-primary')
            .style({ padding: '4px 12px', background: '#0e639c', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' })
            .on('click', () => this.execute())
            .mount(toolbar);

        // Language Select
        this.langSelect = $('select')
            .style({ background: '#333', color: '#eee', border: '1px solid #444', borderRadius: '3px', padding: '2px' })
            .on('change', (e) => { this.state.language = e.target.value; })
            .child($('option').attr({ value: 'metta' }).text('MeTTa'))
            .child($('option').attr({ value: 'narsese' }).text('Narsese'))
            .mount(toolbar);

        this._disposables.push(this.state.watch('language', (lang) => {
             if (this.langSelect && this.langSelect.dom.value !== lang) {
                 this.langSelect.dom.value = lang;
             }
        }));
        this.langSelect.dom.value = this.state.language;

        // Demo Select
        this.demoSelect = $('select')
            .id('demo-select')
            .style({ background: '#333', color: '#eee', border: '1px solid #444', borderRadius: '3px', padding: '2px', maxWidth: '150px' })
            .child($('option').text('Load Demo...'))
            .on('change', (e) => this.onDemoSelect(e.target.value))
            .mount(toolbar);

        this.loadDemos();

        $('button')
            .text('💾 Save')
            .style({ padding: '4px 8px', background: '#333', color: '#ccc', border: '1px solid #444', borderRadius: '3px', cursor: 'pointer' })
            .on('click', () => this.saveFile())
            .mount(toolbar);

        $('button')
            .text('📂 Load')
            .style({ padding: '4px 8px', background: '#333', color: '#ccc', border: '1px solid #444', borderRadius: '3px', cursor: 'pointer' })
            .on('click', () => this.loadFile())
            .mount(toolbar);

        // Auto Run Toggle
        const autoRunLabel = $('label')
            .style({ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85em', color: '#ccc', marginLeft: '8px', cursor: 'pointer' })
            .mount(toolbar);

        const autoRunCheck = $('input')
            .attr({ type: 'checkbox' })
            .on('change', (e) => { this.state.autoRun = e.target.checked; });

        this._disposables.push(this.state.watch('autoRun', (val) => {
            if (autoRunCheck.dom.checked !== val) {
                autoRunCheck.dom.checked = val;
            }
        }));
        autoRunCheck.dom.checked = this.state.autoRun;

        autoRunLabel.child(autoRunCheck).child(document.createTextNode('Auto-Run'));

        $('span')
            .text('Shift+Enter to Run')
            .style({ fontSize: '0.8em', color: '#888', alignSelf: 'center', marginLeft: 'auto' })
            .mount(toolbar);

        // Editor Area
        const editorContainer = $('div')
            .style({ flex: '1', position: 'relative', height: 'calc(100% - 35px)', overflow: 'hidden' })
            .mount(this.container);

        try {
            this.editor = new SmartTextarea(editorContainer.dom, {
                rows: 20,
                autoResize: false,
                onExecute: (text) => this.execute(text)
            });

            const editorEl = this.editor.render();
            editorEl.style.height = '100%';
            this.editor.textarea.style.height = '100%'; // Ensure full height

            // Hook for Auto-Run
            if (this.editor.textarea) {
                this.editor.textarea.addEventListener('input', this.debounce(() => {
                    if (this.state.autoRun) {
                        this.execute();
                    }
                }, 1000));
            } else {
                console.error('CodeEditorPanel: textarea not found in SmartTextarea');
            }
        } catch (e) {
            console.error('CodeEditorPanel Error:', e);
        }
    }

    saveFile() {
        const content = this.editor.getValue();
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'code.nars'; // Default to nars, could detect
        a.click();
        URL.revokeObjectURL(url);
    }

    loadFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.nars,.metta,.scm,.txt';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    this.editor.setValue(evt.target.result);
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    async loadDemos() {
        try {
            const response = await fetch('/examples.json');
            const data = await response.json();

            const flatten = (items, groupName) => {
                let results = [];
                items.forEach(item => {
                    if (item.type === 'directory') {
                        const newGroup = groupName ? `${groupName} / ${item.name}` : item.name;
                        results = results.concat(flatten(item.children, newGroup));
                    } else if (item.type === 'file') {
                        results.push({ ...item, group: groupName });
                    }
                });
                return results;
            };

            const allFiles = flatten(data.children || [], '');

            // Group by group name
            const grouped = {};
            allFiles.forEach(f => {
                if (!grouped[f.group]) grouped[f.group] = [];
                grouped[f.group].push(f);
            });

            // Create optgroups
            for (const [group, files] of Object.entries(grouped)) {
                const optgroup = $('optgroup').attr({ label: group });
                files.forEach(f => {
                    optgroup.child($('option').attr({ value: f.path }).text(f.name));
                });
                this.demoSelect.child(optgroup);
            }

        } catch (e) {
            console.error('Failed to load demos:', e);
        }
    }

    async onDemoSelect(path) {
        if (!path || path === 'Load Demo...') return;

        try {
            const response = await fetch('/' + path);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const content = await response.text();
            this.editor.setValue(content);

            // Detect language
            if (path.endsWith('.metta')) {
                this.state.language = 'metta';
            } else if (path.endsWith('.nars')) {
                this.state.language = 'narsese';
            }

        } catch (e) {
            console.error('Failed to load demo file:', e);
            this.app?.logger?.log?.(`Failed to load demo: ${e.message}`, 'error');
        }
    }

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    execute(text) {
        const content = text || this.editor.getValue();
        if (!content.trim()) return;

        // Future: Check syntax based on this.state.language before running

        if (this.app?.commandProcessor) {
            // Optionally log to notebook if available
            const notebookComponent = this.app.components.get('notebook');
            let logCell = null;

            if (notebookComponent && notebookComponent.notebookManager) {
                // Log input first
                logCell = notebookComponent.notebookManager.createCodeCell(content);
                // Important: Update lastInsertionPoint so the result attaches here
                notebookComponent.notebookManager.lastInsertionPoint = logCell;
            }

            // Send to command processor
            this.app.commandProcessor.processCommand(content, false, this.state.language);
        }
    }

    resize() {
        // Handle resize if needed
    }

    destroy() {
        super.destroy();
        this._disposables.forEach(d => d());
        this._disposables = [];
    }
}
