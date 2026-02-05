import { Component } from '../Component.js';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { Modal } from '../ui/Modal.js';

cytoscape.use(fcose);

export class SimpleGraphWidget extends Component {
    constructor(container, data = []) {
        super(container);
        this.data = data;
        this.cy = null;
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.style.cssText = 'height: 350px; width: 100%; background: #0a0a0c; border: 1px solid var(--border-color); position: relative; border-radius: 4px; overflow: hidden;';

        const graphDiv = document.createElement('div');
        graphDiv.style.cssText = 'width: 100%; height: 100%;';
        this.container.appendChild(graphDiv);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => this.initCy(graphDiv));
        });
    }

    initCy(container, elements = null) {
        const elems = elements || this._convertData(this.data);

        try {
            this.cy = cytoscape({
                container: container,
                elements: elems,
                style: this._getGraphStyle(),
                layout: this._getLayoutConfig()
            });

            this._createControls();

        } catch (e) {
            console.error('Error initializing SimpleGraphWidget:', e);
            container.innerHTML = `<div style="padding:10px; color:red;">Error: ${e.message}</div>`;
        }
    }

    _getGraphStyle() {
        return [
            {
                selector: 'node',
                style: {
                    'background-color': '#111',
                    'label': 'data(label)',
                    'color': '#00ff9d',
                    'font-size': '10px',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'width': 'mapData(val, 0, 100, 20, 60)',
                    'height': 'mapData(val, 0, 100, 20, 60)',
                    'border-width': 2,
                    'border-color': '#00ff9d',
                    'text-outline-color': '#000',
                    'text-outline-width': 2,
                    'font-family': 'monospace',
                    'text-transform': 'uppercase'
                }
            },
            {
                selector: 'node[type="task"]',
                style: {
                    'border-color': '#ffcc00',
                    'color': '#ffcc00'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#333',
                    'target-arrow-color': '#333',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'label': 'data(label)',
                    'font-size': '8px',
                    'color': '#555',
                    'text-rotation': 'autorotate',
                    'text-background-opacity': 1,
                    'text-background-color': '#0a0a0c',
                    'text-background-padding': '2px'
                }
            },
            {
                selector: ':selected',
                style: {
                    'border-width': 4,
                    'border-color': '#fff',
                    'line-color': '#fff',
                    'target-arrow-color': '#fff',
                    'shadow-blur': 10,
                    'shadow-color': '#fff'
                }
            }
        ];
    }

    _getLayoutConfig() {
        return {
            name: 'fcose',
            animate: true,
            animationDuration: 500,
            padding: 30,
            nodeDimensionsIncludeLabels: true,
            randomize: true
        };
    }

    _createControls() {
        const controls = document.createElement('div');
        controls.className = 'graph-overlay-controls';

        const fitBtn = document.createElement('button');
        fitBtn.innerHTML = '⤢';
        fitBtn.title = 'Fit View';
        fitBtn.onclick = () => this.cy.fit();

        const expandBtn = document.createElement('button');
        expandBtn.innerHTML = '🔭';
        expandBtn.title = 'Expand View';
        expandBtn.onclick = () => this.expandView();

        controls.append(fitBtn, expandBtn);
        this.container.appendChild(controls);
    }

    _convertData(data) {
        return data.map(d => {
            if (d.source && d.target) {
                return {
                    group: 'edges',
                    data: {
                        id: d.id || `${d.source}-${d.target}`,
                        source: d.source,
                        target: d.target,
                        label: d.label || ''
                    }
                };
            }
            return {
                group: 'nodes',
                data: {
                    id: d.id,
                    label: d.label || d.id,
                    type: d.type || 'concept',
                    val: d.val || 10
                }
            };
        });
    }

    updateData(newElements) {
        if (!this.cy) return;
        this.cy.add(newElements);
        this.cy.layout({ name: 'fcose', animate: true }).run();
    }

    expandView() {
        const elements = this.cy.json().elements;

        const content = document.createElement('div');
        content.style.cssText = 'width:100%; height:100%;';

        const modal = new Modal({
            title: 'Graph View',
            content: content,
            width: '90vw',
            height: '90vh'
        });
        modal.show();

        // Initialize new graph instance in modal
        // Using a new SimpleGraphWidget for simplicity
        const widget = new SimpleGraphWidget(content, []);
        // Bypass render/wait cycle
        requestAnimationFrame(() => {
            widget.initCy(content, elements);
        });
    }
}
