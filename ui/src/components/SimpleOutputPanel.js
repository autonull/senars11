import { Component } from './Component.js';
import { FluentUI } from '../utils/FluentUI.js';
import { marked } from 'marked';

export class SimpleOutputPanel extends Component {
    constructor(container) {
        super(container);
        this.logContainer = null;
    }

    render() {
        if (!this.container) return;
        this.fluent().clear().class('simple-output-panel').style({ height: '100%', display: 'flex', flexDirection: 'column' });

        // Toolbar
        const toolbar = FluentUI.create('div')
            .class('output-toolbar')
            .style({ padding: '5px', background: '#252526', borderBottom: '1px solid #333', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: '0' })
            .mount(this.container);

        toolbar.child(
            FluentUI.create('strong').text('Output').style({ marginRight: 'auto' })
        );

        toolbar.child(
            FluentUI.create('button')
                .text('🗑️ Clear')
                .style({ padding: '4px 8px', background: '#333', color: '#ccc', border: '1px solid #444', borderRadius: '3px', cursor: 'pointer' })
                .on('click', () => this.clear())
        );

        // Log Area
        this.logContainer = FluentUI.create('div')
            .class('log-container')
            .style({ flex: '1', overflowY: 'auto', padding: '10px', fontFamily: 'Consolas, monospace', fontSize: '14px' })
            .mount(this.container);
    }

    addLog(content, type = 'info', icon = null) {
        if (!this.logContainer) return;

        const entry = FluentUI.create('div')
            .style({
                marginBottom: '4px',
                borderBottom: '1px solid #333',
                paddingBottom: '4px',
                wordWrap: 'break-word',
                whiteSpace: 'pre-wrap'
            });

        // Styling based on type
        if (type === 'error') entry.style({ color: '#f14c4c' });
        else if (type === 'warning') entry.style({ color: '#cca700' });
        else if (type === 'success') entry.style({ color: '#89d185' });
        else if (type === 'input') entry.style({ color: '#569cd6', fontWeight: 'bold' });
        else if (type === 'result' || type.includes('reasoning')) entry.style({ color: '#d4d4d4' });
        else entry.style({ color: '#cccccc' });

        const time = new Date().toLocaleTimeString();
        const iconStr = icon || (type === 'input' ? '>' : '');

        let displayContent = content;

        // Try to parse JSON result for cleaner display if it's a simple result wrapper
        if (typeof content === 'string' && content.startsWith('{"result":')) {
            try {
                const parsed = JSON.parse(content);
                if (parsed.result && Object.keys(parsed).length === 1) {
                    displayContent = parsed.result; // Just show the result value
                }
            } catch (e) {
                // Keep original content if parsing fails
            }
        }

        entry.text(`[${time}] ${iconStr} ${displayContent}`);

        this.logContainer.child(entry);
        this.scrollToBottom();
    }

    logMarkdown(content) {
        if (!this.logContainer) return;

        const entry = FluentUI.create('div')
            .class('markdown-content')
            .style({ marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '8px' });

        try {
            entry.html(marked.parse(content));
        } catch (e) {
            entry.text(content);
        }

        this.logContainer.child(entry);
        this.scrollToBottom();
    }

    logWidget(type, data) {
         if (!this.logContainer) return;

         const entry = FluentUI.create('div')
            .style({ marginBottom: '8px', border: '1px solid #444', padding: '5px', background: '#2d2d2d' });

         entry.child(FluentUI.create('div').text(`Widget: ${type}`).style({ fontWeight: 'bold', marginBottom: '4px' }));

         const json = JSON.stringify(data, null, 2);
         entry.child(FluentUI.create('pre').text(json).style({ overflowX: 'auto', fontSize: '12px' }));

         this.logContainer.child(entry);
         this.scrollToBottom();
    }

    clear() {
        if (this.logContainer) {
            this.logContainer.clear();
        }
    }

    scrollToBottom() {
        if (this.logContainer) {
            this.logContainer.dom.scrollTop = this.logContainer.dom.scrollHeight;
        }
    }

    // NotebookManager Interface Mocks for CodeEditorPanel / MessageRouter

    createCodeCell(content) {
        this.addLog(content, 'input');
        return {
            isEditing: false,
            updateMode: () => {},
            id: 'mock-cell-' + Date.now()
        };
    }

    createMarkdownCell(content) {
        this.logMarkdown(content);
    }

    createWidgetCell(type, data) {
        this.logWidget(type, data);
    }

    createPromptCell(question, callback) {
        this.addLog(`Prompt: ${question}`, 'question', '❓');
        // Simple prompt handling could be added here
    }

    createResultCell(content, type, viewMode) {
        this.addLog(content, type);
    }
}
