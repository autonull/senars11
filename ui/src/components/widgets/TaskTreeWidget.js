import { SimpleGraphWidget } from './SimpleGraphWidget.js';

export class TaskTreeWidget extends SimpleGraphWidget {
    constructor(container, data = []) {
        super(container, data);
    }

    initCy(container, elements = null) {
        super.initCy(container, elements);

        if (this.cy) {
            this._applyTreeStyle();
            this._runTreeLayout();
        }
    }

    _applyTreeStyle() {
        this.cy.style()
            .selector('node')
            .style({
                'shape': 'round-rectangle',
                'width': 'label',
                'height': '30px',
                'padding': '8px',
                'text-valign': 'center',
                'text-halign': 'center',
                'background-color': '#2d2d2d',
                'border-width': 1,
                'border-color': '#555',
                'font-size': '11px',
                'label': 'data(label)'
            })
            .selector('node[type="goal"]')
            .style({
                'border-color': '#ffcc00',
                'color': '#ffcc00'
            })
            .selector('node[type="op"]')
            .style({
                'border-color': '#00ff9d',
                'color': '#00ff9d',
                'shape': 'ellipse'
            })
            .selector('edge')
            .style({
                'curve-style': 'taxi',
                'taxi-direction': 'downward',
                'target-arrow-shape': 'triangle',
                'width': 2,
                'line-color': '#555',
                'target-arrow-color': '#555'
            })
            .update();
    }

    _runTreeLayout() {
        this.cy.layout({
            name: 'breadthfirst',
            directed: true,
            padding: 20,
            spacingFactor: 1.2,
            animate: true
        }).run();
    }

    _convertData(data) {
        // If data is hierarchical { id, label, children: [...] }
        if (!Array.isArray(data) && data.children) {
            return this._flattenTree(data);
        }
        // If data is array of hierarchical nodes
        if (Array.isArray(data) && data.length > 0 && data[0].children) {
            let elements = [];
            data.forEach(root => {
                elements = elements.concat(this._flattenTree(root));
            });
            return elements;
        }

        // Default to SimpleGraphWidget behavior (flat list of nodes/edges)
        return super._convertData(data);
    }

    _flattenTree(node, parentId = null) {
        let elements = [];
        const nodeId = node.id || `node_${Math.random().toString(36).substr(2, 9)}`;

        elements.push({
            group: 'nodes',
            data: {
                id: nodeId,
                label: node.label || node.term || nodeId,
                type: node.type || 'concept'
            }
        });

        if (parentId) {
            elements.push({
                group: 'edges',
                data: {
                    id: `edge_${parentId}_${nodeId}`,
                    source: parentId,
                    target: nodeId,
                    label: node.relation || ''
                }
            });
        }

        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => {
                elements = elements.concat(this._flattenTree(child, nodeId));
            });
        }

        return elements;
    }
}
