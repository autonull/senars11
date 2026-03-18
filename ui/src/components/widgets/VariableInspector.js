import { Component } from '../Component.js';
import { FluentUI } from '../../utils/FluentUI.js';

export class VariableInspector extends Component {
    constructor(container, data = {}) {
        super(container);
        this.bindings = data.bindings || {};
    }

    render() {
        if (!this.container) return;

        this.fluent().clear().class('variable-inspector')
            .style({
                padding: '10px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '4px',
                width: '100%',
                border: '1px solid var(--border-color)'
            });

        // Header
        this.fluent().child(
            FluentUI.create('div')
                .text('Variable Bindings')
                .style({
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                    textTransform: 'uppercase'
                })
        );

        if (Object.keys(this.bindings).length === 0) {
            this.bindings = { '$x': 'bird', '$y': 'flyer', '$z': 'animal' }; // Demo data
        }

        const table = FluentUI.create('table')
            .style({ width: '100%', borderCollapse: 'collapse', fontSize: '12px' });

        // Header
        table.child(
            FluentUI.create('thead').child(
                FluentUI.create('tr').style({ borderBottom: '1px solid #444' })
                    .child(FluentUI.create('th').text('Variable').style({ textAlign: 'left', padding: '4px', color: '#888' }))
                    .child(FluentUI.create('th').text('Value').style({ textAlign: 'left', padding: '4px', color: '#888' }))
            )
        );

        const tbody = FluentUI.create('tbody');

        Object.entries(this.bindings).forEach(([key, value]) => {
            const row = FluentUI.create('tr').style({ borderBottom: '1px solid #333' });

            row.child(
                FluentUI.create('td').text(key).style({ padding: '6px 4px', fontFamily: 'monospace', color: '#00ff9d' })
            );

            row.child(
                FluentUI.create('td').text(String(value)).style({ padding: '6px 4px', color: '#d4d4d4' })
            );

            tbody.child(row);
        });

        table.child(tbody);
        this.fluent().child(table);
    }
}
