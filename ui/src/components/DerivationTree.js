import { Component } from './Component.js';
import { DerivationWidget } from './widgets/DerivationWidget.js';
import { FluentUI } from '../utils/FluentUI.js';

export class DerivationTree extends Component {
    constructor(container) {
        super(container);
        this.history = [];
        this.selectedDerivation = null;
        this.widget = null;
        this.ui = {
            historyList: null,
            graphContainer: null
        };
    }

    initialize() {
        if (!this.container) return;

        this.fluent().clear().class('dt-wrapper');

        const wrapper = FluentUI.create('div')
            .class('dt-container')
            .mount(this.container);

        // Sidebar
        FluentUI.create('div')
            .class('dt-sidebar')
            .child(
                FluentUI.create('div')
                    .style({ padding: '8px', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-header)' })
                    .text('HISTORY')
            )
            .child(
                this.ui.historyList = FluentUI.create('div')
                    .class('dt-history-list')
                    .id('dt-history')
            )
            .child(
                FluentUI.create('div')
                    .class('dt-toolbar')
                    .child(
                        FluentUI.create('button')
                            .id('dt-export')
                            .attr({ title: 'Export History' })
                            .style({ padding: '2px 6px', fontSize: '10px', cursor: 'pointer' })
                            .text('💾 Export')
                            .on('click', () => this.exportHistory())
                    )
            )
            .mount(wrapper);

        // Main Graph Area
        this.ui.graphContainer = FluentUI.create('div')
            .class('dt-main')
            .id('dt-graph')
            .mount(wrapper);

        // Initialize Widget
        this.widget = new DerivationWidget(this.ui.graphContainer.dom, null);
        requestAnimationFrame(() => this.widget.render());
    }

    exportHistory() {
        if (this.history.length === 0) {
            alert('No derivation history to export.');
            return;
        }
        const blob = new Blob([JSON.stringify(this.history, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `derivations-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    addDerivation(data) {
        if (!data) return;
        if (!data.timestamp) data.timestamp = new Date().toLocaleTimeString();

        this.history.unshift(data);
        this.renderHistory();
        this.selectDerivation(data);
    }

    renderHistory() {
        if (!this.ui.historyList) return;
        this.ui.historyList.clear();

        for (const item of this.history) {
            FluentUI.create('div')
                .class(`dt-history-item ${this.selectedDerivation === item ? 'active' : ''}`)
                .on('click', () => this.selectDerivation(item))
                .child(FluentUI.create('div').class('dt-rule').text(item.rule ?? 'Unknown Rule'))
                .child(FluentUI.create('div').class('dt-term').attr({ title: item.derived?.term }).text(item.derived?.term ?? '...'))
                .child(FluentUI.create('div').class('dt-time').text(item.timestamp))
                .mount(this.ui.historyList);
        }
    }

    selectDerivation(data) {
        this.selectedDerivation = data;
        this.renderHistory();
        this.widget?.setDerivation(data);
    }

    resize() {
        if (this.widget?.cy) {
            this.widget.cy.resize();
            this.widget.cy.fit();
        }
    }
}
