import { GraphViewport } from '../zui/GraphViewport.js';
import { BagBuffer } from './BagBuffer.js';

export class ExplorerGraph {
    constructor(container) {
        this.viewport = new GraphViewport(container);
        this.bag = new BagBuffer(50); // Limit visible nodes
        this.mode = 'visualization';
        this.mappings = {
            size: 'priority',
            color: 'hash'
        };
    }

    async initialize() {
        if (this.viewport.initialize()) {
            this._applyTacticalStyle();
            return true;
        }
        return false;
    }

    setSizeMapping(mode) {
        this.mappings.size = mode;
        this._updateStyles();
    }

    setColorMapping(mode) {
        this.mappings.color = mode;
        this._updateStyles();
    }

    _updateStyles() {
        this._applyTacticalStyle();
        // Force redraw if needed, though applyTacticalStyle updates stylesheet
    }

    clear() {
        this.bag.clear();
        this.viewport.cy.elements().remove();
        this._syncGraph();
    }

    onNodeTap(callback) {
        if (this.viewport.cy) {
            this.viewport.cy.on('tap', 'node', (evt) => {
                const node = evt.target;
                callback({
                    id: node.id(),
                    ...node.data()
                });
            });
        }
    }

    onNodeHover(callback) {
        if (this.viewport.cy) {
            this.viewport.cy.on('mouseover', 'node', (evt) => {
                const node = evt.target;
                node.addClass('hovered');
                callback({
                    id: node.id(),
                    ...node.data()
                });
            });
        }
    }

    onNodeHoverOut(callback) {
        if (this.viewport.cy) {
            this.viewport.cy.on('mouseout', 'node', (evt) => {
                const node = evt.target;
                node.removeClass('hovered');
                callback({
                    id: node.id(),
                    ...node.data()
                });
            });
        }
    }

    onNodeDoubleTap(callback) {
        if (this.viewport.cy) {
            this.viewport.cy.on('dbltap', 'node', (evt) => {
                const node = evt.target;
                callback({
                    id: node.id(),
                    ...node.data()
                });
            });
        }
    }

    onContextTap(callback) {
        if (this.viewport.cy) {
            this.viewport.cy.on('cxttap', (evt) => {
                const target = evt.target;
                if (target === this.viewport.cy) {
                    // Background click
                    callback(evt.originalEvent, null, 'background');
                } else if (target.isNode()) {
                    callback(evt.originalEvent, target, 'node');
                } else if (target.isEdge()) {
                    callback(evt.originalEvent, target, 'edge');
                }
            });
        }
    }

    animateGlow(id, intensity = 1.0) {
        if (!this.viewport.cy) return;
        const node = this.viewport.cy.$id(id);
        if (node.nonempty()) {
            // Target acquisition effect
             node.animation({
                style: {
                    'border-width': 2 * intensity,
                    'border-opacity': 1,
                    'overlay-padding': 15 * intensity,
                    'overlay-color': '#00ff9d',
                    'overlay-opacity': 0.5,
                    'background-color': 'rgba(0, 255, 157, 0.4)'
                },
                duration: 150
            }).play().promise('complete').then(() => {
                node.animation({
                     style: {
                        'border-width': 1, // Reset to tactical default
                        'border-opacity': 1,
                        'overlay-padding': 0,
                        'overlay-opacity': 0,
                        'background-color': 'rgba(0,0,0,0.5)'
                     },
                     duration: 600
                }).play();
            });
        }
    }

    animateFadeIn(id) {
        if (!this.viewport.cy) return;
        const ele = this.viewport.cy.$id(id);
        if (ele.nonempty()) {
            ele.style('opacity', 0);
            ele.animate({
                style: { opacity: 1 },
                duration: 500
            });
        }
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

    updatePriorities() {
        if (!this.viewport.cy) return;

        this.viewport.cy.batch(() => {
            this.bag.getAll().forEach(item => {
                const node = this.viewport.cy.$id(item.id);
                if (node.nonempty()) {
                    // Update visual weight based on new priority
                    // We assume styles are bound to 'weight' or opacity
                    const newWeight = (item.priority * 30) + 20;
                    if (node.data('weight') !== newWeight) {
                        node.data('weight', newWeight);
                        // Also update opacity?
                        node.style('opacity', 0.2 + (item.priority * 0.8));
                    }
                }
            });
        });
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

                    // Fade in new node
                    const newNode = this.viewport.cy.$id(item.id);
                    newNode.style('opacity', 0);
                    newNode.animate({
                         style: { opacity: 0.2 + (item.priority * 0.8) },
                         duration: 500
                    });
                }
            });
        });
    }

    _getColorFromHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return { hue, color: `hsl(${hue}, 70%, 50%)` };
    }

    _applyTacticalStyle() {
        if (!this.viewport.cy) return;

        const getSize = (ele) => {
            if (this.mappings.size === 'fixed') return 40;
            if (this.mappings.size === 'priority') {
                const p = ele.data('priority') || 0;
                return 30 + (p * 50);
            }
            if (this.mappings.size === 'complexity') {
                const l = (ele.data('label') || '').length;
                return Math.min(30 + (l * 2), 80);
            }
            return 40;
        };

        const getColor = (ele, prop = 'background') => {
            const type = ele.data('type');
            const p = ele.data('priority') || 0;
            const label = ele.data('label') || '';

            if (this.mappings.color === 'type') {
                const base = type === 'task' ? [255, 187, 0] : [0, 255, 157]; // Amber or Green
                const alpha = prop === 'background' ? (0.1 + (p * 0.4)) : 1;
                return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha})`;
            }

            if (this.mappings.color === 'hash') {
                const { hue } = this._getColorFromHash(label);
                const alpha = prop === 'background' ? (0.1 + (p * 0.4)) : 1;
                return `hsla(${hue}, 70%, 50%, ${alpha})`;
            }

            if (this.mappings.color === 'priority') {
                // Heatmap style: Low (Blue) -> High (Red)
                const hue = 240 - (p * 240);
                const alpha = prop === 'background' ? 0.4 : 1;
                return `hsla(${hue}, 80%, 50%, ${alpha})`;
            }

            return '#fff';
        };

        const style = [
            {
                selector: 'node',
                style: {
                    'label': (ele) => {
                        const type = ele.data('type');
                        const label = ele.data('label');
                        const emoji = type === 'concept' ? '🧠' : type === 'task' ? '⚡' : '🔹';
                        return `${emoji} ${label}`;
                    },
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'color': (ele) => getColor(ele, 'border'),
                    'text-background-color': 'rgba(0,0,0,0.5)',
                    'text-background-opacity': 1,
                    'text-background-padding': 2,
                    'background-color': (ele) => getColor(ele, 'background'),
                    'border-width': 1,
                    'border-color': (ele) => getColor(ele, 'border'),
                    'width': getSize,
                    'height': getSize,
                    'font-family': 'Consolas, monospace',
                    'font-size': 10,
                    'text-transform': 'uppercase',
                    'transition-property': 'border-width, border-color, width, height, opacity, background-color',
                    'transition-duration': '0.3s'
                }
            },
            {
                selector: 'node[type="task"]',
                style: {
                    'shape': 'diamond'
                }
            },
            {
                selector: 'node[type="concept"]',
                style: {
                    'shape': 'hexagon'
                }
            },
            {
                selector: '.layer-hidden',
                style: {
                    'display': 'none'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 1,
                    'line-color': '#334433',
                    'target-arrow-color': '#334433',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'opacity': 0.8
                }
            },
            {
                selector: 'edge[label="inheritance"]',
                style: {
                    'line-style': 'dotted',
                    'line-color': '#00ff9d',
                    'target-arrow-color': '#00ff9d',
                    'width': 1
                }
            },
            {
                selector: 'edge[label="similarity"]',
                style: {
                    'line-style': 'dashed',
                    'line-dash-pattern': [4, 4],
                    'line-color': '#00d4ff',
                    'target-arrow-shape': 'none',
                    'width': 1
                }
            },
            {
                selector: 'edge[label="implication"]',
                style: {
                    'line-style': 'solid',
                    'line-color': '#00ff9d',
                    'target-arrow-color': '#00ff9d',
                    'width': 2,
                    'arrow-scale': 1.5
                }
            },
            {
                selector: 'edge[label="equivalence"]',
                style: {
                    'line-style': 'dashed',
                    'line-dash-pattern': [2, 2],
                    'line-color': '#ff00ff',
                    'target-arrow-shape': 'none',
                    'width': 1
                }
            },
            {
                selector: ':selected',
                style: {
                    'border-width': 2,
                    'border-color': '#fff',
                    'border-style': 'double',
                    'overlay-color': '#00ff9d',
                    'overlay-padding': 5,
                    'overlay-opacity': 0.3
                }
            },
            {
                selector: '.highlighted',
                style: {
                    'border-width': 4,
                    'border-color': '#00d4ff',
                    'overlay-color': '#00d4ff',
                    'overlay-padding': 10,
                    'overlay-opacity': 0.5
                }
            },
            {
                selector: '.hovered',
                style: {
                    'border-width': 2,
                    'border-style': 'solid',
                    'overlay-color': '#fff',
                    'overlay-padding': 5,
                    'overlay-opacity': 0.2,
                    'z-index': 9999
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
            name: 'cose',
            animate: true,
            animationDuration: 1000,
            padding: 50,
            nodeOverlap: 20,
            componentSpacing: 100,
            nodeRepulsion: function( node ){ return 4096; },
            idealEdgeLength: function( edge ){ return 100; },
            edgeElasticity: function( edge ){ return 100; },
            nestingFactor: 5,
            gravity: 80,
            numIter: 1000,
            initialTemp: 200,
            coolingFactor: 0.95,
            minTemp: 1.0
        }).run();
    }

    toggleLayer(layerName, isVisible) {
        if (!this.viewport.cy) return;

        const selector = layerName === 'tasks' ? 'node[type="task"]' :
                         layerName === 'concepts' ? 'node[type="concept"]' : null;

        if (selector) {
            const elements = this.viewport.cy.elements(selector);
            if (isVisible) {
                elements.removeClass('layer-hidden');
            } else {
                elements.addClass('layer-hidden');
            }
        }
    }

    findNode(id) {
        if (!this.viewport.cy) return null;

        // Try exact match first
        let node = this.viewport.cy.$id(id);

        // If not found, try case-insensitive partial match on label
        if (node.empty()) {
            const nodes = this.viewport.cy.nodes().filter(n => n.data('label').toLowerCase().includes(id.toLowerCase()));
            if (nodes.nonempty()) {
                node = nodes.first();
            }
        }

        if (node.nonempty()) {
            this.viewport.cy.animate({
                center: { eles: node },
                zoom: 1.5,
                duration: 500
            });

            // Highlight effect
            node.addClass('highlighted');
            setTimeout(() => node.removeClass('highlighted'), 2000);

            return node;
        }
        return null;
    }

    highlightMatches(term) {
        if (!this.viewport.cy) return;

        this.viewport.cy.batch(() => {
            const allElements = this.viewport.cy.elements();
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
        if (!this.viewport.cy) return;

        const node = this.viewport.cy.$id(nodeId);
        if (node.empty()) return;

        this.viewport.cy.batch(() => {
            // If already focused, clear focus
            if (node.hasClass('focused-target')) {
                this.clearFocus();
                return;
            }

            this.viewport.cy.elements().removeClass('focused-target focused-context').addClass('dimmed');

            node.removeClass('dimmed').addClass('focused-target');

            const neighborhood = node.neighborhood();
            neighborhood.removeClass('dimmed').addClass('focused-context');
        });

        this.viewport.cy.animate({
            center: { eles: node },
            zoom: 2,
            duration: 500
        });
    }

    clearFocus() {
        if (!this.viewport.cy) return;
        this.viewport.cy.batch(() => {
            this.viewport.cy.elements().removeClass('dimmed focused-target focused-context');
        });
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
