import { SimpleGraphWidget } from './SimpleGraphWidget.js';
import { EVENTS } from '../../config/constants.js';

export class DerivationWidget extends SimpleGraphWidget {
    constructor(container, data = null) {
        super(container, []);
        this.derivationData = data;
    }

    initCy(container, elements = null) {
        const elems = elements || (this.derivationData ? this._buildDerivationElements(this.derivationData) : []);
        super.initCy(container, elems);

        if (this.cy) {
            this.cy.style()
                .selector('node')
                .style({
                    'background-color': '#222', 'label': 'data(label)', 'color': '#e0e0e0',
                    'font-family': 'monospace', 'font-size': '10px', 'text-valign': 'center', 'text-halign': 'center',
                    'text-wrap': 'wrap', 'width': 'label', 'height': 'label', 'padding': '10px',
                    'shape': 'round-rectangle', 'border-width': 1, 'border-color': '#333'
                })
                .selector('node[type="rule"]')
                .style({ 'background-color': '#333', 'border-color': '#00bcd4', 'color': '#00bcd4' })
                .selector('node[type="conclusion"]')
                .style({ 'border-color': '#00ff9d', 'color': '#00ff9d', 'font-weight': 'bold' })
                .selector('edge')
                .style({ 'width': 1, 'line-color': '#444', 'target-arrow-color': '#444', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' })
                .update();

            this._runLayout();

            // Event listener for clicks
            this.cy.on('tap', 'node', (evt) => {
                const data = evt.target.data();
                if (data.type === 'conclusion' || data.type === 'premise') {
                    const concept = {
                        term: data.fullTerm || data.label,
                        id: data.id
                    };
                    document.dispatchEvent(new CustomEvent(EVENTS.CONCEPT_SELECT, {
                        detail: { concept }
                    }));
                }
            });
        }
    }

    setDerivation(data) {
        this.derivationData = data;
        if (this.cy) {
            this.cy.elements().remove();
            if (data) {
                const elems = this._buildDerivationElements(data);
                this.cy.add(elems);
                this._runLayout();
            }
        }
    }

    _runLayout() {
        if (this.cy) {
            this.cy.layout({
                name: 'breadthfirst', directed: true, padding: 50,
                spacingFactor: 1.5, animate: true
            }).run();
        }
    }

    _buildDerivationElements(data) {
        if (!data || !data.derived) return [];

        const elements = [];
        const { input, knowledge, derived, rule } = data;
        const ruleId = 'rule';

        elements.push({ group: 'nodes', data: { id: ruleId, label: rule || 'Rule', type: 'rule' } });

        const addTermNode = (termData, type) => {
            if (!termData) return null;
            const id = 'node_' + Math.random().toString(36).substr(2, 9);
            const label = termData.term || 'Unknown';
            elements.push({
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
        elements.push({ group: 'edges', data: { source: ruleId, target: derivedId } });

        if (input) {
            const inputId = addTermNode(input, 'premise');
            elements.push({ group: 'edges', data: { source: inputId, target: ruleId } });
        }

        if (knowledge) {
            const knowId = addTermNode(knowledge, 'premise');
            elements.push({ group: 'edges', data: { source: knowId, target: ruleId } });
        }

        return elements;
    }
}
