import {Config} from '../config/Config.js';
import {ContextMenu} from '../components/ContextMenu.js';
import {DESIGN_TOKENS} from '@senars/core';

export class GraphManager {
    constructor(uiElements = null, callbacks = {}) {
        this.cy = null;
        this.uiElements = uiElements;
        this.callbacks = callbacks;
        this.graphData = {
            nodes: new Map(),
            edges: new Map()
        };

        // Debouncing for layout updates to improve performance
        this.layoutTimeout = null;
        this.pendingLayout = false;
        this.layoutDebounceTime = 300; // milliseconds
        this.updatesEnabled = false; // Disabled by default (since sidebar is hidden by default)

        // Will be initialized later with command processor
        this.contextMenu = null;

        // Keyboard navigation state
        this.kbState = { index: 0, selectedNode: null };
    }

    /**
     * Set whether graph updates are enabled
     */
    setUpdatesEnabled(enabled) {
        this.updatesEnabled = enabled;
        if (enabled && this.cy) {
            this.cy.resize();
            this.cy.fit();
            this.scheduleLayout();
        }
    }

    /**
     * Initialize keyboard navigation for accessibility
     */
    initializeKeyboardNavigation() {
        const container = this.uiElements?.graphContainer;
        if (!container) return;

        container.setAttribute('tabindex', '0');
        container.setAttribute('role', 'application');
        container.setAttribute('aria-label', 'SeNARS concept graph visualization');
        container.addEventListener('keydown', (e) => this._handleKeyboardEvent(e));
    }

    _handleKeyboardEvent(e) {
        if (!this.cy) return;
        const nodes = this.cy.nodes();
        if (nodes.length === 0) return;

        switch (e.key) {
            case 'Tab':
                e.preventDefault();
                this._cycleNodes(nodes, e.shiftKey);
                break;
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
                e.preventDefault();
                this._navigateNeighbors(nodes);
                break;
            case 'Enter':
                e.preventDefault();
                this._selectCurrentNode();
                break;
            case 'Escape':
                e.preventDefault();
                this._clearSelection();
                break;
        }
    }

    _cycleNodes(nodes, reverse) {
        const delta = reverse ? -1 : 1;
        this.kbState.index = (this.kbState.index + delta + nodes.length) % nodes.length;
        this.kbState.selectedNode = nodes[this.kbState.index];
        this.highlightNode(this.kbState.selectedNode);
    }

    _navigateNeighbors(nodes) {
        const { selectedNode } = this.kbState;
        if (selectedNode) {
            const connected = selectedNode.neighborhood('node');
            if (connected.length > 0) {
                const nextNode = connected[0];
                this.kbState.selectedNode = nextNode;
                // Note: assuming nodes collection order is stable for index search, or strictly use array if needed.
                // For performance with large graphs, this might need optimization, but keeping it simple for now.
                // nodes.indexOf might not exist on collection, using array conversion check if needed or manual search?
                // Actually Cytoscape collections are array-like but don't have indexOf.
                // We'll rely on index maintenance or simple search.
                // For now, let's reset index to 0 or find it if we really need consistent Tab cycling order after navigation.
                // Finding index in full list:
                let idx = -1;
                for(let i=0; i<nodes.length; i++) { if(nodes[i].id() === nextNode.id()) { idx = i; break; } }
                this.kbState.index = idx >= 0 ? idx : 0;

                this.highlightNode(nextNode);
            }
        } else {
            this.kbState.selectedNode = nodes[0];
            this.kbState.index = 0;
            this.highlightNode(this.kbState.selectedNode);
        }
    }

    _selectCurrentNode() {
        const node = this.kbState.selectedNode;
        if (node) {
            const data = {
                type: 'node',
                label: node.data('label'),
                id: node.id(),
                term: node.data('fullData')?.term || node.data('label'),
                nodeType: node.data('type') || 'unknown',
                weight: node.data('weight') || 0,
                fullData: node.data('fullData')
            };
            this.updateGraphDetails(data);
            this.callbacks.onNodeClick?.(data);
        }
    }

    _clearSelection() {
        if (this.kbState.selectedNode) {
            this.cy.elements().removeClass('keyboard-selected');
            this.kbState.selectedNode = null;
        }
    }

    /**
     * Highlight a node for keyboard navigation
     * @param {Object} node - Cytoscape node object
     */
    highlightNode(node) {
        if (!this.cy || !node) return;

        // Remove previous highlight
        this.cy.elements().removeClass('keyboard-selected');

        // Add highlight to current node
        node.addClass('keyboard-selected');

        // Pan to node
        this.cy.animate({
            center: {elt: node},
            zoom: this.cy.zoom()
        }, {
            duration: 200
        });

        // Announce to screen readers (ARIA live region would be ideal)
        const label = node.data('label');
        const nodeType = node.data('type');
        console.log(`Selected ${nodeType} node: ${label}`);
    }

    /**
     * Initialize the Cytoscape instance
     */
    initialize() {
        // Guard clause: Check if UI elements are available
        if (!this.uiElements?.graphContainer) {
            console.error('Graph container element not found');
            return false;
        }


        try {
            this.cy = cytoscape({
                container: this.uiElements.graphContainer,
                style: Config.getGraphStyle(),
                layout: Config.getGraphLayout()
            });
        } catch (error) {
            console.error('Failed to initialize Cytoscape:', error);
            // Fallback to grid or random layout if fcose fails
            if (error.message.includes('No such layout')) {
                console.warn('Falling back to "random" layout due to initialization error.');
                this.cy = cytoscape({
                    container: this.uiElements.graphContainer,
                    style: Config.getGraphStyle(),
                    layout: {name: 'random'}
                });
            } else {
                return false;
            }
        }

        // Initialize keyboard navigation
        this.initializeKeyboardNavigation();

        // Initialize context menu (if command processor available)
        if (this.callbacks.commandProcessor) {
            this.contextMenu = new ContextMenu(this, this.callbacks.commandProcessor);
        }

        // Add event delegation for details panel buttons
        if (this.uiElements.graphDetails) {
            this.uiElements.graphDetails.addEventListener('click', (e) => {
                if (e.target.matches('button[data-action]')) {
                    const action = e.target.dataset.action;
                    const nodeId = e.target.dataset.id;
                    const term = e.target.dataset.term;

                    if (this.callbacks.onNodeAction) {
                        this.callbacks.onNodeAction(action, {id: nodeId, term});
                    }
                }
            });
        }

        // Add click event for graph details
        this.cy.on('tap', 'node', (event) => {
            const node = event.target;
            const data = {
                type: 'node',
                label: node.data('label'),
                id: node.id(),
                term: node.data('fullData')?.term || node.data('label'),
                nodeType: node.data('type') || 'unknown',
                weight: node.data('weight') || 0,
                fullData: node.data('fullData')
            };

            this.updateGraphDetails(data);

            if (this.callbacks.onNodeClick) {
                this.callbacks.onNodeClick(data);
            }
        });

        this.cy.on('tap', 'edge', (event) => {
            const edge = event.target;
            this.updateGraphDetails({
                type: 'edge',
                label: edge.data('label') || 'Relationship',
                source: edge.data('source'),
                target: edge.data('target'),
                edgeType: edge.data('type') || 'unknown'
            });
        });

        // Right-click context menu for nodes
        this.cy.on('cxttap', 'node', (event) => {
            event.preventDefault();
            if (this.contextMenu) {
                const pos = event.renderedPosition || event.position;
                this.contextMenu.show(pos.x, pos.y, event.target, 'node');
            }
        });

        // Right-click context menu for edges
        this.cy.on('cxttap', 'edge', (event) => {
            event.preventDefault();
            if (this.contextMenu) {
                const pos = event.renderedPosition || event.position;
                this.contextMenu.show(pos.x, pos.y, event.target, 'edge');
            }
        });

        // Double-click on node for primary action
        this.cy.on('dbltap', 'node', (event) => {
            const node = event.target;
            // Center and zoom to node
            this.cy.animate({
                center: {eles: node},
                zoom: 2,
                duration: 300
            });
            this.animateGlow(node.id(), 1.0);
        });

        return true;
    }

    /**
     * Add a node to the graph
     * @param {Object} nodeData - Data for the node to be added
     * @param {string|number} [nodeData.id] - Unique identifier for the node
     * @param {string} [nodeData.label] - Display label for the node
     * @param {string} [nodeData.term] - Alternative term for the node
     * @param {string} [nodeData.type] - Type of the node (concept, task, etc.)
     * @param {string} [nodeData.nodeType] - Alternative property for node type
     * @param {Object} [nodeData.truth] - Truth value data for the node
     * @param {boolean} [runLayout=true] - Whether to run layout after adding the node
     * @returns {boolean} - True if node was successfully added, false otherwise
     */
    addNode(nodeData, runLayout = true) {
        if (!this.cy) return false;

        const { id, label, term, type, nodeType, truth, weight } = nodeData;
        const nodeId = id ?? `concept_${Date.now()}`;

        if (this.cy.getElementById(nodeId).length) return false;

        let displayLabel = label ?? term ?? id;
        if (truth) {
            const { frequency = 0, confidence = 0 } = truth;
            displayLabel += `\n{${frequency.toFixed(2)}, ${confidence.toFixed(2)}}`;
        }

        const typeValue = nodeType ?? type ?? 'concept';

        this.cy.add({
            group: 'nodes',
            data: {
                id: nodeId,
                label: displayLabel,
                type: typeValue,
                weight: weight ?? (truth?.confidence ? truth.confidence * 100 : Config.getConstants().DEFAULT_NODE_WEIGHT),
                fullData: nodeData
            },
            ariaLabel: `${typeValue} node: ${displayLabel.split('\n')[0]}`
        });

        if (runLayout) this.scheduleLayout();
        return true;
    }

    /**
     * Add an edge to the graph
     */
    addEdge(edgeData, runLayout = true) {
        if (!this.cy) return false;

        const { id, source, target, label, type, edgeType } = edgeData;
        const edgeId = id ?? `edge_${Date.now()}_${source}_${target}`;

        if (this.cy.getElementById(edgeId).length) return false;

        this.cy.add({
            group: 'edges',
            data: {
                id: edgeId,
                source,
                target,
                label: label ?? 'Relationship',
                type: edgeType ?? type ?? 'relationship'
            }
        });

        if (runLayout) this.scheduleLayout();
        return true;
    }

    /**
     * Update graph from a memory snapshot
     */
    updateFromSnapshot(payload) {
        if (!this.cy || !payload?.concepts) return;

        // Clear existing elements
        this.cy.elements().remove();

        // Add nodes from concepts in batch
        const concepts = payload.concepts || [];
        if (concepts.length > 0) {
            const nodes = concepts.map((concept, index) => ({
                group: 'nodes',
                data: {
                    id: concept.id || `concept_${index}`,
                    label: concept.term || `Concept ${index}`,
                    type: concept.type || 'concept',
                    weight: concept.truth?.confidence ? concept.truth.confidence * 100 : 50,
                    fullData: concept
                }
            }));
            this.cy.add(nodes);
        }

        // Layout the graph
        this.scheduleLayout();
    }

    /**
     * Update graph based on incoming message
     */
    updateFromMessage(message) {
        if (!this.cy || !this.updatesEnabled) return;

        const messageUpdates = {
            'concept.created': () => this.addNodeWithPayload(message.payload, false),
            'concept.added': () => this.addNodeWithPayload(message.payload, false),
            'task.added': () => this.addNodeWithPayload({...message.payload, nodeType: 'task'}, false),
            'task.input': () => this.addNodeWithPayload({...message.payload, nodeType: 'task'}, false),
            'question.answered': () => this.addQuestionNode(message.payload),
            'memorySnapshot': () => {
                this.updateFromSnapshot(message.payload);
                // Snapshot updates already run layout
            }
        };

        const updateFn = messageUpdates[message.type];
        if (updateFn) {
            updateFn();

            // Only run layout once after processing the message, if we added nodes/edges
            if (this.shouldRunLayoutAfterMessage(message.type)) {
                this.scheduleLayout();
            }
        }
    }

    /**
     * Helper method to add a node with payload
     */
    addNodeWithPayload(payload, runLayout = true) {
        if (payload) {
            this.addNode(payload, runLayout);
        }
    }

    /**
     * Helper method to add a question node
     */
    addQuestionNode(payload) {
        if (payload) {
            const {answer, question} = payload;
            this.addNode({
                label: answer || question || 'Answer',
                nodeType: 'question',
                weight: Config.getConstants().QUESTION_NODE_WEIGHT
            }, false); // Don't run layout immediately
        }
    }

    /**
     * Determine if layout should run after a specific message type
     */
    shouldRunLayoutAfterMessage(messageType) {
        return ['concept.created', 'concept.added', 'task.added', 'task.input', 'question.answered'].includes(messageType);
    }

    /**
     * Schedule a graph layout run with debouncing to improve performance
     * This prevents excessive layout calculations when multiple graph changes occur rapidly
     */
    scheduleLayout() {
        this.pendingLayout = true;

        // Clear existing timeout to debounce
        if (this.layoutTimeout) {
            clearTimeout(this.layoutTimeout);
        }

        // Schedule layout to run after debounce time
        this.layoutTimeout = setTimeout(() => {
            if (this.pendingLayout && this.cy) {
                this.cy.layout(Config.getGraphLayout()).run();
                this.pendingLayout = false;
            }
        }, this.layoutDebounceTime);
    }

    /**
     * Run the graph layout immediately (without debouncing)
     */
    runLayout() {
        if (this.cy) {
            this.cy.layout(Config.getGraphLayout()).run();
        }
    }

    /**
     * Update the graph style (e.g., after toggling high-contrast mode)
     */
    updateStyle() {
        if (this.cy) {
            this.cy.style(Config.getGraphStyle());
        }
    }

    /**
     * Update the graph details panel
     */
    updateGraphDetails(details) {
        const graphDetailsElement = this.uiElements?.graphDetails;
        if (!graphDetailsElement) return;

        // Create content based on type to avoid duplicate code
        const content = details.type === 'node'
            ? this.createNodeDetailsContent(details)
            : this.createEdgeDetailsContent(details);

        graphDetailsElement.innerHTML = content;
    }

    /**
     * Set visibility of task nodes
     */
    setTaskVisibility(visible) {
        if (!this.cy) return;
        const tasks = this.cy.nodes('[type = "task"]');
        if (visible) {
            tasks.style('display', 'element');
        } else {
            tasks.style('display', 'none');
        }
    }

    /**
     * Create content for node details
     */
    createNodeDetailsContent(details) {
        const data = details.fullData || {};
        let html = [
            `<div style="margin-bottom:4px"><strong>Type:</strong> ${details.nodeType}</div>`,
            `<div style="margin-bottom:4px"><strong>Term:</strong> <span style="color:#4ec9b0; font-family:monospace">${details.label}</span></div>`
        ].join('');

        if (data.truth) {
            const {frequency, confidence} = data.truth;
            const freq = typeof frequency === 'number' ? frequency.toFixed(2) : '0.00';
            const conf = typeof confidence === 'number' ? confidence.toFixed(2) : '0.00';
            html += `<div style="margin-bottom:4px"><strong>Truth:</strong> <span style="color:#ce9178; font-family:monospace">{${freq}, ${conf}}</span></div>`;
        }

        if (data.budget) {
            const {priority} = data.budget;
            const pri = typeof priority === 'number' ? priority.toFixed(2) : '0.00';
            html += `<div style="margin-bottom:4px"><strong>Priority:</strong> ${pri}</div>`;
        }

        html += `<div style="margin-top:4px; font-size:0.8em; color:#666">ID: ${details.id}</div>`;

        // Add actions
        html += `
            <div style="margin-top:8px; display:flex; gap:5px;">
                <button data-action="focus" data-id="${details.id}" data-term="${details.term || details.label}" style="padding:2px 6px; font-size:0.8em; cursor:pointer;">Focus</button>
                <button data-action="inspect" data-id="${details.id}" data-term="${details.term || details.label}" style="padding:2px 6px; font-size:0.8em; cursor:pointer;">Inspect</button>
            </div>
        `;

        return html;
    }

    /**
     * Create content for edge details
     */
    createEdgeDetailsContent(details) {
        return [
            `<strong>Edge:</strong> ${details.label}<br>`,
            `<strong>Source:</strong> ${details.source}<br>`,
            `<strong>Target:</strong> ${details.target}<br>`,
            `<strong>Type:</strong> ${details.edgeType}`
        ].join('');
    }

    /**
     * Get node count
     */
    getNodeCount() {
        return this.cy ? this.cy.nodes().length : 0;
    }

    /**
     * Get task nodes
     */
    getTaskNodes() {
        return this.cy ? this.cy.nodes('[type = "task"]') : null;
    }

    /**
     * Get concept nodes
     */
    getConceptNodes() {
        return this.cy ? this.cy.nodes('[type = "concept"]') : null;
    }

    /**
     * Clear the graph
     */
    clear() {
        if (this.cy) {
            this.cy.elements().remove();
        }
    }

    /**
     * Animate a node with pulse effect (for derivations, new concepts)
     * @param {string} nodeId - Node ID to animate
     * @param {string} effect - Animation effect type (currently supports 'pulse')
     */
    animateNode(nodeId, effect = 'pulse') {
        if (!this.cy) return;

        const node = this.cy.getElementById(nodeId);
        if (!node.length) return;

        const originalColor = node.style('border-color');
        const originalWidth = node.style('border-width');

        // Pulse: expand border with highlight color, then return to normal
        node.animate({
            style: {
                'border-width': 8,
                'border-color': DESIGN_TOKENS.colors.highlight
            },
            duration: DESIGN_TOKENS.timing.pulse
        }).animate({
            style: {
                'border-width': originalWidth || 2,
                'border-color': originalColor
            },
            duration: DESIGN_TOKENS.timing.pulse
        });
    }

    /**
     * Animate glow effect on node (for focus promotion/demotion)
     * @param {string} nodeId - Node ID to animate
     * @param {number} intensity - Glow intensity (0-1), where 1 is full glow, 0 is dim
     */
    animateGlow(nodeId, intensity = 1.0) {
        if (!this.cy) return;

        const node = this.cy.getElementById(nodeId);
        if (!node.length) return;

        const baseSize = node.data('weight') || 50;
        const targetSize = baseSize * (0.8 + intensity * 0.4); // Range: 80%-120% of base
        const borderWidth = 2 + intensity * 6; // Range: 2-8px

        node.animate({
            style: {
                'width': targetSize,
                'height': targetSize,
                'border-width': borderWidth,
                'opacity': 0.6 + intensity * 0.4 // Range: 0.6-1.0
            },
            duration: DESIGN_TOKENS.timing.glow
        });
    }

    /**
     * Animate fade-in effect for newly added nodes
     * @param {string} nodeId - Node ID to animate
     */
    animateFadeIn(nodeId) {
        if (!this.cy) return;

        const node = this.cy.getElementById(nodeId);
        if (!node.length) return;

        // Start invisible, fade to full opacity
        node.style('opacity', 0);
        node.animate({
            style: {'opacity': 1},
            duration: DESIGN_TOKENS.timing.glow
        });
    }

    /**
     * Zoom in on the graph
     */
    zoomIn() {
        if (!this.cy) return;
        const currentZoom = this.cy.zoom();
        const newZoom = Math.min(currentZoom * 1.2, 3); // Max zoom 3x
        this.cy.animate({
            zoom: newZoom,
            duration: 200
        });
    }

    /**
     * Zoom out on the graph
     */
    zoomOut() {
        if (!this.cy) return;
        const currentZoom = this.cy.zoom();
        const newZoom = Math.max(currentZoom / 1.2, 0.3); // Min zoom 0.3x
        this.cy.animate({
            zoom: newZoom,
            duration: 200
        });
    }

    /**
     * Fit graph to screen
     */
    fitToScreen() {
        if (!this.cy) return;
        this.cy.animate({
            fit: {
                eles: this.cy.elements(),
                padding: 30
            },
            duration: 300
        });
    }

    /**
     * Destroy the graph manager and clean up resources
     */
    destroy() {
        if (this.layoutTimeout) {
            clearTimeout(this.layoutTimeout);
            this.layoutTimeout = null;
        }
        if (this.contextMenu) {
            this.contextMenu.destroy();
            this.contextMenu = null;
        }
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }
    }
}