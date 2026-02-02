import { GraphViewport } from '../zui/GraphViewport.js';
import { BagBuffer } from './BagBuffer.js';

export class ExplorerGraph {
    constructor(container) {
        this.viewport = new GraphViewport(container);
        this.bag = new BagBuffer(50); // Limit visible nodes
        this.mode = 'visualization';
    }

    async initialize() {
        if (this.viewport.initialize()) {
            this._applyPsychedelicStyle();
            return true;
        }
        return false;
    }

    addConcept(term, priority, details = {}) {
        this.bag.add(term, priority, details);
        this._syncGraph();
    }

    addRelationship(source, target, type) {
        // Only add edge if both nodes exist (handled by Cytoscape usually, but good to check)
        if (this.viewport.cy.$id(source).nonempty() && this.viewport.cy.$id(target).nonempty()) {
            // Check if edge exists
            const edgeId = `${source}-${target}-${type}`;
            if (this.viewport.cy.$id(edgeId).empty()) {
                this.viewport.addElements({
                    group: 'edges',
                    data: {
                        id: edgeId,
                        source: source,
                        target: target,
                        label: type
                    }
                });
            }
        }
    }

    _syncGraph() {
        if (!this.viewport.cy) return;

        const visibleItems = this.bag.getAll();
        const visibleIds = new Set(visibleItems.map(i => i.id));

        this.viewport.cy.batch(() => {
            // Remove nodes not in bag
            // Note: removing nodes automatically removes connected edges
            this.viewport.cy.nodes().forEach(node => {
                if (!visibleIds.has(node.id())) {
                    this.viewport.cy.remove(node);
                }
            });

            // Add new nodes
            visibleItems.forEach(item => {
                if (this.viewport.cy.$id(item.id).empty()) {
                    // Random initial position to prevent stacking at 0,0
                    const pos = {
                        x: Math.random() * 800 - 400,
                        y: Math.random() * 600 - 300
                    };

                    this.viewport.addElements({
                        group: 'nodes',
                        data: {
                            id: item.id,
                            label: item.id,
                            weight: (item.priority * 30) + 20, // Size based on priority
                            priority: item.priority,
                            type: item.data.type || 'concept',
                            ...item.data
                        },
                        position: pos
                    });
                }
            });
        });
    }

    _applyPsychedelicStyle() {
        if (!this.viewport.cy) return;

        const style = [
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'color': '#fff',
                    'text-outline-width': 1,
                    'text-outline-color': '#000',
                    'background-color': '#333',
                    'border-width': 2,
                    'border-color': '#00d4ff', // Cyan
                    'width': 'data(weight)',
                    'height': 'data(weight)',
                    'font-family': 'Segoe UI, sans-serif',
                    'font-size': 12,
                    'text-shadow-blur': 4,
                    'text-shadow-color': '#000',
                    'transition-property': 'background-color, border-color, width, height',
                    'transition-duration': '0.3s'
                }
            },
            {
                selector: 'node[type="task"]',
                style: {
                    'shape': 'diamond',
                    'border-color': '#ff00ff', // Magenta
                    'background-color': '#4a004a'
                }
            },
            {
                selector: 'node[type="concept"]',
                style: {
                    'shape': 'ellipse',
                    'border-color': '#00ff88', // Lime
                    'background-color': '#004a2d'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 1,
                    'line-color': '#555',
                    'target-arrow-color': '#555',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'opacity': 0.6
                }
            },
            {
                selector: 'edge[label="inheritance"]',
                style: {
                    'line-style': 'solid',
                    'line-color': '#ccc',
                    'target-arrow-color': '#ccc',
                    'width': 2
                }
            },
            {
                selector: 'edge[label="similarity"]',
                style: {
                    'line-style': 'dashed',
                    'line-color': '#00d4ff',
                    'target-arrow-shape': 'none',
                    'width': 2
                }
            },
            {
                selector: 'edge[label="implication"]',
                style: {
                    'line-style': 'solid',
                    'line-color': '#ffbb00',
                    'target-arrow-color': '#ffbb00',
                    'width': 3
                }
            },
            {
                selector: 'edge[label="equivalence"]',
                style: {
                    'line-style': 'dashed',
                    'line-color': '#ff00ff',
                    'target-arrow-shape': 'none',
                    'width': 2
                }
            },
            {
                selector: ':selected',
                style: {
                    'border-width': 4,
                    'border-color': '#fff',
                    'overlay-color': '#fff',
                    'overlay-opacity': 0.2
                }
            }
        ];

        this.viewport.cy.style(style);
    }

    setMode(mode) {
        this.mode = mode;
        // Update graph behavior based on mode
        if (mode === 'visualization') {
            this.viewport.cy.autoungrabify(true); // Disable dragging
        } else {
            this.viewport.cy.autoungrabify(false);
        }
    }

    relayout() {
        if (!this.viewport.cy) return;

        this.viewport.cy.layout({
            name: 'grid',
            animate: true,
            animationDuration: 500,
            padding: 50
        }).run();
    }

    fit() {
        this.viewport.fit();
    }

    zoomIn() {
        this.viewport.cy.animate({ zoom: this.viewport.cy.zoom() * 1.2, duration: 200 });
    }

    zoomOut() {
        this.viewport.cy.animate({ zoom: this.viewport.cy.zoom() / 1.2, duration: 200 });
    }
}
