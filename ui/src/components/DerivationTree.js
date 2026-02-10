import { Component } from './Component.js';
import cytoscape from 'cytoscape';

export class DerivationTree extends Component {
    constructor(container) {
        super(container);
        this.cy = null;
        this.history = [];
        this.selectedDerivation = null;
    }

    initialize() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.style.cssText = 'width: 100%; height: 100%; overflow: hidden;';

        const style = document.createElement('style');
        style.textContent = `
            .dt-container { display: flex; width: 100%; height: 100%; }
            .dt-sidebar { width: 200px; border-right: 1px solid var(--border-color); display: flex; flex-direction: column; background: var(--bg-panel); flex-shrink: 0; }
            .dt-main { flex: 1; position: relative; background: var(--bg-graph, #1e1e1e); }
            .dt-history-list { overflow-y: auto; flex: 1; }
            .dt-history-item { padding: 8px; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); transition: background 0.1s; }
            .dt-history-item:hover { background: rgba(255,255,255,0.05); }
            .dt-history-item.active { background: rgba(0,255,157,0.1); border-left: 2px solid var(--accent-primary); color: var(--text-main); }
            .dt-rule { color: var(--accent-secondary); font-weight: bold; margin-bottom: 2px; }
            .dt-term { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .dt-time { font-size: 10px; opacity: 0.7; }
            .dt-toolbar { padding: 4px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; }
        `;
        this.container.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.className = 'dt-container';
        wrapper.innerHTML = `
            <div class="dt-sidebar">
                <div style="padding: 8px; font-weight: bold; border-bottom: 1px solid var(--border-color); background: var(--bg-header);">HISTORY</div>
                <div class="dt-history-list" id="dt-history"></div>
                <div class="dt-toolbar">
                    <button id="dt-export" title="Export History" style="padding: 2px 6px; font-size:10px; cursor: pointer;">💾 Export</button>
                </div>
            </div>
            <div class="dt-main" id="dt-graph"></div>
        `;
        this.container.appendChild(wrapper);

        this.historyList = wrapper.querySelector('#dt-history');
        this.graphContainer = wrapper.querySelector('#dt-graph');

        wrapper.querySelector('#dt-export').addEventListener('click', () => this.exportHistory());

        // Defer Cytoscape init to ensure container has dimensions
        requestAnimationFrame(() => this._initCytoscape());
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

    _initCytoscape() {
        if (!this.graphContainer) return;

        // Ensure container has size
        if (this.graphContainer.clientWidth === 0 || this.graphContainer.clientHeight === 0) {
            // Retry later
            requestAnimationFrame(() => this._initCytoscape());
            return;
        }

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

            this.cy.on('tap', 'node', (evt) => {
                const data = evt.target.data();
                if (data.type === 'conclusion' || data.type === 'premise') {
                     const concept = {
                         term: data.fullTerm || data.label,
                         id: data.id
                     };
                     document.dispatchEvent(new CustomEvent('senars:concept:select', {
                        detail: { concept }
                     }));
                }
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

        for (const item of this.history) {
            const div = document.createElement('div');
            div.className = `dt-history-item ${this.selectedDerivation === item ? 'active' : ''}`;
            div.innerHTML = `
                <div class="dt-rule">${item.rule ?? 'Unknown Rule'}</div>
                <div class="dt-term" title="${item.derived?.term}">${item.derived?.term ?? '...'}</div>
                <div class="dt-time">${item.timestamp}</div>
            `;
            div.onclick = () => this.selectDerivation(item);
            this.historyList.appendChild(div);
        }
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
