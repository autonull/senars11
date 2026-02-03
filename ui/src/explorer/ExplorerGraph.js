import { GraphViewport } from '../zui/GraphViewport.js';
import { BagBuffer } from '../data/BagBuffer.js';
import { getTacticalStyle } from '../visualization/ExplorerGraphTheme.js';

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
        this.viewport.clear();
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
        const currentNodes = this.viewport.cy.nodes();

        this.viewport.cy.batch(() => {
            // Efficient removal using Set
            for (const node of currentNodes) {
                if (!visibleIds.has(node.id())) {
                    this.viewport.cy.remove(node);
                }
            }

            // Efficient addition (checking existence before creating)
            for (const item of visibleItems) {
                if (this.viewport.cy.$id(item.id).empty()) {
                    this._addNode(item);
                }
            }
        });
    }

    _addNode(item) {
        const pos = {
            x: Math.random() * 800 - 400,
            y: Math.random() * 600 - 300
        };

        this.viewport.addElements({
            group: 'nodes',
            data: {
                id: item.id,
                label: item.id,
                weight: (item.priority * 30) + 20,
                priority: item.priority,
                type: item.data.type || 'concept',
                ...item.data
            },
            position: pos
        });

        // Animation
        const newNode = this.viewport.cy.$id(item.id);
        newNode.style('opacity', 0);
        newNode.animate({
             style: { opacity: 0.2 + (item.priority * 0.8) },
             duration: 500
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
        const style = getTacticalStyle(this.mappings, this._getColorFromHash.bind(this));
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
        return this.viewport.findNode(id);
    }

    highlightMatches(term) {
        this.viewport.highlightMatches(term);
    }

    setFocus(nodeId) {
        this.viewport.setFocus(nodeId);
    }

    clearFocus() {
        this.viewport.clearFocus();
    }

    fit() {
        this.viewport.fit();
    }

    zoomIn() {
        this.viewport.zoomIn();
    }

    zoomOut() {
        this.viewport.zoomOut();
    }
}
