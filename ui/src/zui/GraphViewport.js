/**
 * GraphViewport handles the Cytoscape instance and rendering for ZUI.
 */
import cytoscape from 'cytoscape';

export class GraphViewport {
    constructor(container) {
        this.container = container;
        this.cy = null;
        this.callbacks = {};
    }

    initialize() {
        const container = typeof this.container === 'string'
            ? document.getElementById(this.container)
            : this.container;

        if (!container) {
            console.error(`GraphViewport: Container not found`, this.container);
            return false;
        }

        // Use global cytoscape if available (with extensions), otherwise local
        const cyFactory = window.cytoscape || cytoscape;

        try {
            this.cy = cyFactory({
                container: container,
                style: this._getDefaultStyle(),
                layout: {
                    name: 'grid',
                    padding: 50,
                    avoidOverlap: true,
                    spacingFactor: 1.5
                },
                minZoom: 0.1,
                maxZoom: 10,
                wheelSensitivity: 0.2
            });

            this._setupEvents();
            return true;
        } catch (error) {
            console.error('GraphViewport: Failed to initialize Cytoscape', error);
            return false;
        }
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    trigger(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    _setupEvents() {
        if (!this.cy) return;

        // Propagate zoom/pan events
        this.cy.on('zoom pan', () => {
            this.trigger('viewport', {
                zoom: this.cy.zoom(),
                pan: this.cy.pan(),
                extent: this.cy.extent()
            });
        });

        this.cy.on('tap', 'node', (evt) => {
            this.trigger('nodeClick', { node: evt.target });
        });
    }

    _getDefaultStyle() {
        return [
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'color': '#fff',
                    'text-outline-width': 2,
                    'text-outline-color': '#333',
                    'background-color': '#666',
                    'width': 'data(weight)',
                    'height': 'data(weight)'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#ccc',
                    'target-arrow-color': '#ccc',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier'
                }
            },
             {
                selector: '.highlighted',
                style: {
                    'background-color': '#00ff9d',
                    'line-color': '#00ff9d',
                    'target-arrow-color': '#00ff9d',
                    'transition-property': 'background-color, line-color, target-arrow-color',
                    'transition-duration': '0.3s'
                }
            }
        ];
    }

    // API to be used by ActivityGraph
    addElements(elements) {
        this.cy?.add(elements);
    }

    clear() {
        this.cy?.elements().remove();
    }

    fit() {
        this.cy?.fit();
    }
}
