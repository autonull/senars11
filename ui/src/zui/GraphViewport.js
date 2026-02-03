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

    findNode(id) {
        if (!this.cy) return null;

        const term = id?.toLowerCase();
        let node = this.cy.$id(id);

        if (node.empty() && term) {
            node = this.cy.nodes().filter(n =>
                (n.data('label') || '').toLowerCase().includes(term)
            ).first();
        }

        if (node.nonempty()) {
            this.cy.animate({
                center: { eles: node },
                zoom: 1.5,
                duration: 500
            });

            node.addClass('highlighted');
            setTimeout(() => node.removeClass('highlighted'), 2000);
            return node;
        }
        return null;
    }

    highlightMatches(term) {
        if (!this.cy) return;

        this.cy.batch(() => {
            const allElements = this.cy.elements();
            allElements.removeClass('matched dimmed');

            if (!term || term.length < 2) return;

            const termLower = term.toLowerCase();
            const matches = allElements.filter(ele => {
                if (!ele.isNode()) return false;
                const label = (ele.data('label') || '').toLowerCase();
                return label.includes(termLower);
            });

            if (matches.nonempty()) {
                allElements.addClass('dimmed');
                matches.removeClass('dimmed').addClass('matched');
                matches.connectedEdges().removeClass('dimmed'); // Show connections for context
            }
        });
    }

    setFocus(nodeId) {
        if (!this.cy) return;

        const node = this.cy.$id(nodeId);
        if (node.empty()) return;

        this.cy.batch(() => {
            // If already focused, clear focus
            if (node.hasClass('focused-target')) {
                this.clearFocus();
                return;
            }

            this.cy.elements().removeClass('focused-target focused-context').addClass('dimmed');

            node.removeClass('dimmed').addClass('focused-target');

            const neighborhood = node.neighborhood();
            neighborhood.removeClass('dimmed').addClass('focused-context');
        });

        this.cy.animate({
            center: { eles: node },
            zoom: 2,
            duration: 500
        });
    }

    clearFocus() {
        if (!this.cy) return;
        this.cy.batch(() => {
            this.cy.elements().removeClass('dimmed focused-target focused-context');
        });
    }

    zoomIn() {
        this.cy?.animate({ zoom: this.cy.zoom() * 1.2, duration: 200 });
    }

    zoomOut() {
        this.cy?.animate({ zoom: this.cy.zoom() / 1.2, duration: 200 });
    }
}
