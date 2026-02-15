import { SimpleGraphWidget } from './SimpleGraphWidget.js';

export class TaskTreeWidget extends SimpleGraphWidget {
    constructor(container, data = []) {
        super(container, data);
    }

    // Override initCy to use breadthfirst layout
    initCy(container, elements = null) {
        super.initCy(container, elements);

        if (this.cy) {
            // Apply tree-specific styles
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
                    'font-size': '11px'
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
                    'target-arrow-shape': 'triangle'
                })
                .update();

            // Apply tree layout
            this.cy.layout({
                name: 'breadthfirst',
                directed: true,
                padding: 20,
                spacingFactor: 1.2,
                animate: true
            }).run();
        }
    }
}
