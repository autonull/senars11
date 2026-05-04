import { Component } from '../Component.js';
import { FluentUI } from '../../utils/FluentUI.js';

export class SubNotebook extends Component {
    constructor(container, data = {}) {
        super(container);
        this.title = data.title || 'Sub-Notebook';
    }

    render() {
        if (!this.container) {return;}

        this.fluent().clear().class('sub-notebook-widget')
            .style({
                padding: '0',
                background: '#1a1a1a',
                borderRadius: '4px',
                width: '100%',
                border: '1px solid #444',
                overflow: 'hidden'
            });

        // Header
        const header = FluentUI.create('div')
            .style({
                padding: '8px 12px',
                background: '#252526',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            })
            .child(
                FluentUI.create('span').text(this.title).style({ fontWeight: 'bold', fontSize: '12px', color: '#ccc' })
            );

        this.fluent().child(header);

        // Content Area (Placeholder for actual NotebookManager)
        const content = FluentUI.create('div')
            .style({
                padding: '12px',
                minHeight: '100px',
                color: '#666',
                fontStyle: 'italic',
                fontSize: '12px',
                textAlign: 'center'
            })
            .text('Nested notebook context area. Drop cells here (future feature).');

        this.fluent().child(content);
    }
}
