import { Component } from './Component.js';

export class DerivationTree extends Component {
    constructor(container) {
        super(container);
        this.cy = null;
        this.history = [];
        this.selectedDerivation = null;
    }

    initialize() {
        if (!this.container) return;

        const style = document.createElement('style');
        style.textContent = `
            .dt-container { display: flex; width: 100%; height: 100%; }
            .dt-sidebar { width: 200px; border-right: 1px solid var(--border-color); display: flex; flex-direction: column; background: var(--bg-panel); }
            .dt-main { flex: 1; position: relative; }
            .dt-history-list { overflow-y: auto; flex: 1; }
            .dt-history-item { padding: 8px; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); }
            .dt-history-item:hover { background: rgba(255,255,255,0.05); }
            .dt-history-item.active { background: rgba(0,255,157,0.1); border-left: 2px solid var(--accent-primary); color: var(--text-main); }
            .dt-rule { color: var(--accent-secondary); font-weight: bold; margin-bottom: 2px; }
            .dt-term { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .dt-time { font-size: 10px; opacity: 0.7; }
        `;
        this.container.appendChild(style);

        this.container.innerHTML += `
            <div class="dt-container">
                <div class="dt-sidebar">
                    <div style="padding: 8px; font-weight: bold; border-bottom: 1px solid var(--border-color); background: var(--bg-header);">HISTORY</div>
                    <div class="dt-history-list" id="dt-history"></div>
                </div>
                <div class="dt-main" id="dt-graph"></div>
            </div>
        `;

        this.historyList = this.container.querySelector('#dt-history');
        this.graphContainer = this.container.querySelector('#dt-graph');

        this._initCytoscape();
    }

    _initCytoscape() {
        if (!this.graphContainer) return;

        try {
            this.cy = cytoscape({
                container: this.graphContainer,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': '#222', 'label': 'data(label)', 'color': '#e0e0e0',
                            'font-family': 'monospace', 'font-size': '10px', 'text-valign': 'center', 'text-halign': 'center',
                            'text-wrap': 'wrap', 'width': 'label', 'height': 'label', 'padding': '10px',
                            'shape': 'round-rectangle', 'border-width': 1, 'border-color': '#333'
                        }
                    },
                    {
                        selector: 'node[type="rule"]',
                        style: {'background-color': '#333', 'border-color': '#00bcd4', 'color': '#00bcd4'}
                    },
                    {
                        selector: 'node[type="conclusion"]',
                        style: {'border-color': '#00ff9d', 'color': '#00ff9d', 'font-weight': 'bold'}
                    },
                    {
                        selector: 'edge',
                        style: {'width': 1, 'line-color': '#444', 'target-arrow-color': '#444', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier'}
                    }
                ],
                layout: { name: 'grid' }
            });
        } catch (e) {
            console.error('DerivationTree: Failed to init Cytoscape', e);
        }
    }

    addDerivation(data) {
        if (!data) return;
        if (!data.timestamp) data.timestamp = new Date().toLocaleTimeString();

        this.history.unshift(data);
        this.renderHistory();
        this.selectDerivation(data);
    }

    renderHistory() {
        if (!this.historyList) return;
        this.historyList.innerHTML = '';

        this.history.forEach(item => {
            const div = document.createElement('div');
            div.className = `dt-history-item ${this.selectedDerivation === item ? 'active' : ''}`;
            div.innerHTML = `
                <div class="dt-rule">${item.rule || 'Unknown Rule'}</div>
                <div class="dt-term" title="${item.derived?.term}">${item.derived?.term || '...'}</div>
                <div class="dt-time">${item.timestamp}</div>
            `;
            div.onclick = () => this.selectDerivation(item);
            this.historyList.appendChild(div);
        });
    }

    selectDerivation(data) {
        this.selectedDerivation = data;
        this.renderHistory();
        this.renderGraph(data);
    }

    renderGraph(data) {
        if (!this.cy || !data?.derived) return;
        this.cy.elements().remove();

        const { input, knowledge, derived, rule } = data;
        const ruleId = 'rule';

        this.cy.add({ group: 'nodes', data: { id: ruleId, label: rule || 'Rule', type: 'rule' } });

        const addTermNode = (termData, type) => {
            if (!termData) return null;
            const id = 'node_' + Math.random().toString(36).substr(2, 9);
            const label = termData.term || 'Unknown';
            this.cy.add({
                group: 'nodes',
                data: {
                    id: id,
                    label: label.length > 20 ? label.substring(0, 18) + '..' : label,
                    fullTerm: label,
                    type: type
                }
            });
            return id;
        };

        const derivedId = addTermNode(derived, 'conclusion');
        this.cy.add({ group: 'edges', data: { source: ruleId, target: derivedId } });

        if (input) {
            const inputId = addTermNode(input, 'premise');
            this.cy.add({ group: 'edges', data: { source: inputId, target: ruleId } });
        }

        if (knowledge) {
            const knowId = addTermNode(knowledge, 'premise');
            this.cy.add({ group: 'edges', data: { source: knowId, target: ruleId } });
        }

        this.cy.layout({
            name: 'breadthfirst', directed: true, padding: 50,
            spacingFactor: 1.5, animate: true
        }).run();
    }

    resize() {
        if (this.cy) {
            this.cy.resize();
            this.cy.fit();
        }
    }
}
