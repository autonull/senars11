import {Config} from '../config/Config.js';
import {ContextMenu} from '../components/ContextMenu.js';
import {AutoLearner} from '../utils/AutoLearner.js';

export class GraphManager {
    constructor(uiElements = null, callbacks = {}) {
        this.cy = null;
        this.uiElements = uiElements;
        this.callbacks = callbacks;
        this.graphData = { nodes: new Map(), edges: new Map() };
        this.layoutTimeout = null;
        this.pendingLayout = false;
        this.layoutDebounceTime = 300;
        this.updatesEnabled = false;
        this.traceMode = false;
        this.tracedNode = null;
        this.filters = { minPriority: 0, showTasks: true, showConcepts: true };
        this.contextMenu = null;
        this.kbState = { index: 0, selectedNode: null };
        this.autoLearner = new AutoLearner();

        document.addEventListener('senars:concept:select', (e) => {
            const { id, concept } = e.detail;

            // Record interaction via AutoLearner
            if (concept && concept.term) {
                this.autoLearner.recordInteraction(concept.term, 1);
            }

            if (id) {
                const node = this.cy?.getElementById(id);
                if (node?.length) {
                    this.highlightNode(node);
                    this.animateGlow(id, 1.0);
                }
            }
        });

        document.addEventListener('senars:graph:filter', (e) => this.applyFilters(e.detail));
    }

    setUpdatesEnabled(enabled) {
        this.updatesEnabled = enabled;
        if (enabled && this.cy) {
            this.cy.resize();
            this.cy.fit();
            this.scheduleLayout();
        }
    }

    setLayout(name) {
        if (!this.cy) return;
        this.cy.layout(Config.getGraphLayout(name)).run();
    }

    toggleTraceMode(nodeId) {
        if (!this.cy) return;

        if (this.traceMode && this.tracedNode === nodeId) {
            this.traceMode = false;
            this.tracedNode = null;
            this.cy.elements().removeClass('trace-highlight trace-dim');
        } else {
            this.traceMode = true;
            this.tracedNode = nodeId;

            const root = this.cy.getElementById(nodeId);
            const connected = root.union(root.successors()).union(root.predecessors()).union(root.neighborhood());
            const others = this.cy.elements().not(connected);

            this.cy.batch(() => {
                others.addClass('trace-dim').removeClass('trace-highlight');
                connected.addClass('trace-highlight').removeClass('trace-dim');
            });

            this.cy.animate({ fit: { eles: connected, padding: 50 }, duration: 500 });
        }
    }

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
            case 'Tab': e.preventDefault(); this._cycleNodes(nodes, e.shiftKey); break;
            case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
                e.preventDefault(); this._navigateNeighbors(nodes); break;
            case 'Enter': e.preventDefault(); this._selectCurrentNode(); break;
            case 'Escape': e.preventDefault(); this._clearSelection(); break;
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
            const data = this._getNodeData(node);
            this.updateGraphDetails(data);
            this.callbacks.onNodeClick?.(data);
        }
    }

    _getNodeData(node) {
        return {
            type: 'node',
            label: node.data('label'),
            id: node.id(),
            term: node.data('fullData')?.term || node.data('label'),
            nodeType: node.data('type') || 'unknown',
            weight: node.data('weight') || 0,
            fullData: node.data('fullData')
        };
    }

    _clearSelection() {
        if (this.kbState.selectedNode) {
            this.cy.elements().removeClass('keyboard-selected');
            this.kbState.selectedNode = null;
        }
    }

    highlightNode(node) {
        if (!this.cy || !node) return;
        this.cy.elements().removeClass('keyboard-selected');
        node.addClass('keyboard-selected');
        this.cy.animate({ center: {elt: node}, zoom: this.cy.zoom() }, { duration: 200 });
    }

    initialize() {
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
            this.cy = cytoscape({
                container: this.uiElements.graphContainer,
                style: Config.getGraphStyle(),
                layout: {name: 'grid'}
            });
        }

        this.initializeKeyboardNavigation();

        if (this.callbacks.commandProcessor) {
            this.contextMenu = new ContextMenu(this, this.callbacks.commandProcessor);
        }

        this._setupOverlayControls();

        document.addEventListener('senars:settings:updated', () => {
            this.updateStyle();
            this.runLayout();
        });

        this.cy.on('tap', 'node', (event) => {
            const data = this._getNodeData(event.target);
            this.updateGraphDetails(data);
            this.callbacks.onNodeClick?.(data);

            // Dispatch select event to sync with other UI components
            if (data.fullData) {
                document.dispatchEvent(new CustomEvent('senars:concept:select', {
                    detail: { concept: data.fullData, id: data.id }
                }));
            }

            if (event.originalEvent.shiftKey) this.toggleTraceMode(data.id);
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

        this.cy.on('cxttap', 'node', (e) => this._handleContext(e, 'node'));
        this.cy.on('cxttap', 'edge', (e) => this._handleContext(e, 'edge'));

        this.cy.on('dbltap', 'node', (event) => {
            const node = event.target;
            this.cy.animate({ center: {eles: node}, zoom: 2, duration: 300 });
            this.animateGlow(node.id(), 1.0);
            this.toggleTraceMode(node.id());
        });

        return true;
    }

    _handleContext(event, type) {
        event.preventDefault();
        if (this.contextMenu) {
            const pos = event.renderedPosition || event.position;
            this.contextMenu.show(pos.x, pos.y, event.target, type);
        }
    }

    _setupOverlayControls() {
        const container = this.uiElements.graphContainer.parentElement;
        if (!container) return;
        container.querySelector('#btn-layout-fcose')?.addEventListener('click', () => this.setLayout('fcose'));
        container.querySelector('#btn-layout-grid')?.addEventListener('click', () => this.setLayout('grid'));
        container.querySelector('#btn-layout-circle')?.addEventListener('click', () => this.setLayout('circle'));
    }

    addNode(nodeData, runLayout = true) {
        if (!this.cy) return false;

        const { id, label, term, type, nodeType, truth, weight } = nodeData;
        const nodeId = id ?? `concept_${Date.now()}`;

        if (this.cy.getElementById(nodeId).length) return false;

        let displayLabel = label ?? term ?? id;
        if (truth) {
            displayLabel += `\n{${(truth.frequency ?? 0).toFixed(2)}, ${(truth.confidence ?? 0).toFixed(2)}}`;
        }

        const typeValue = nodeType ?? type ?? 'concept';
        const priority = nodeData.budget?.priority ?? 0;
        const taskCount = nodeData.tasks?.length ?? nodeData.taskCount ?? 0;

        // Adjust weight based on learned preference
        let finalWeight = weight ?? (priority * 100);
        if (nodeData.term) {
            const modifier = this.autoLearner.getConceptModifier(nodeData.term);
            finalWeight += modifier; // Boost weight based on past interactions
        }

        this.cy.add({
            group: 'nodes',
            data: {
                id: nodeId,
                label: displayLabel,
                type: typeValue,
                weight: Math.min(finalWeight, 100), // Cap at 100
                taskCount: taskCount,
                fullData: nodeData
            }
        });

        if (runLayout) this.scheduleLayout();
        return true;
    }

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

    updateFromSnapshot(payload) {
        if (!this.cy || !payload?.concepts) return;
        this.cy.elements().remove();

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
        this.scheduleLayout();
    }

    updateFromMessage(message) {
        if (!this.cy || !this.updatesEnabled) return;

        const messageUpdates = {
            'concept.created': () => this.addNodeWithPayload(message.payload, false),
            'concept.added': () => this.addNodeWithPayload(message.payload, false),
            'concept.updated': () => this.updateNode(message.payload),
            'task.added': () => this.addNodeWithPayload({...message.payload, nodeType: 'task'}, false),
            'task.input': () => this.addNodeWithPayload({...message.payload, nodeType: 'task'}, false),
            'question.answered': () => this.addQuestionNode(message.payload),
            'memorySnapshot': () => this.updateFromSnapshot(message.payload)
        };

        const updateFn = messageUpdates[message.type];
        if (updateFn) {
            updateFn();
            if (this.shouldRunLayoutAfterMessage(message.type)) this.scheduleLayout();
        }
    }

    addNodeWithPayload(payload, runLayout = true) {
        if (payload) this.addNode(payload, runLayout);
    }

    updateNode(payload) {
        if (!this.cy || !payload) return;
        const nodeId = payload.id;
        const node = this.cy.getElementById(nodeId);

        if (node.length > 0) {
            const priority = payload.budget?.priority ?? 0;
            const taskCount = payload.tasks?.length ?? payload.taskCount ?? 0;
            let weight = priority * 100;

            if (payload.term) {
                const modifier = this.autoLearner.getConceptModifier(payload.term);
                weight += modifier;
            }

            node.data({
                weight: Math.min(weight, 100),
                taskCount: taskCount,
                fullData: payload
            });

            // If truth updated, update label
            if (payload.truth) {
                let displayLabel = payload.term ?? payload.label ?? nodeId;
                displayLabel += `\n{${(payload.truth.frequency ?? 0).toFixed(2)}, ${(payload.truth.confidence ?? 0).toFixed(2)}}`;
                node.data('label', displayLabel);
            }

            this.animateUpdate(nodeId);
        } else {
            // If it doesn't exist, add it
            this.addNode(payload, false);
        }
    }

    animateUpdate(nodeId) {
        const node = this.cy?.getElementById(nodeId);
        if (!node?.length) return;

        // Visual pulse to indicate update
        // We use a safe default color if config style isn't readily parseable or available
        const highlightColor = '#00ff9d';

        node.animate({
            style: {
                'border-width': 4,
                'border-color': highlightColor
            },
            duration: 150
        }).animate({
             style: {
                'border-width': 1
            },
            duration: 350
        });
    }

    addQuestionNode(payload) {
        if (payload) {
            const {answer, question} = payload;
            this.addNode({
                label: answer || question || 'Answer',
                nodeType: 'question',
                weight: 40
            }, false);
        }
    }

    shouldRunLayoutAfterMessage(messageType) {
        return ['concept.created', 'concept.added', 'task.added', 'task.input', 'question.answered'].includes(messageType);
    }

    scheduleLayout() {
        this.pendingLayout = true;
        if (this.layoutTimeout) clearTimeout(this.layoutTimeout);
        this.layoutTimeout = setTimeout(() => {
            if (this.pendingLayout && this.cy) {
                this.cy.layout(Config.getGraphLayout()).run();
                this.pendingLayout = false;
            }
        }, this.layoutDebounceTime);
    }

    updateStyle() {
        this.cy?.style(Config.getGraphStyle());
    }

    updateGraphDetails(details) {
        // Implementation delegated or empty
    }

    clear() {
        this.cy?.elements().remove();
    }

    getNodeCount() {
        return this.cy ? this.cy.nodes().length : 0;
    }

    getTaskNodes() {
        return this.cy ? this.cy.nodes('[type="task"]').toArray() : [];
    }

    getConceptNodes() {
        return this.cy ? this.cy.nodes('[type="concept"]').toArray() : [];
    }

    animateNode(nodeId) {
        const node = this.cy?.getElementById(nodeId);
        if (!node?.length) return;
        const originalWidth = node.style('border-width');
        node.animate({ style: { 'border-width': 10 }, duration: 200 })
            .animate({ style: { 'border-width': originalWidth }, duration: 200 });
    }

    animateGlow(nodeId, intensity = 1.0) {
        this.cy?.getElementById(nodeId)?.animate({ style: { 'opacity': 0.5 + intensity * 0.5 }, duration: 300 });
    }

    animateFadeIn(nodeId) {
        const node = this.cy?.getElementById(nodeId);
        if (node?.length) {
            node.style('opacity', 0);
            node.animate({ style: {'opacity': 1} }, { duration: 500 });
        }
    }

    zoomIn() { this.cy?.animate({ zoom: this.cy.zoom() * 1.2, duration: 200 }); }
    zoomOut() { this.cy?.animate({ zoom: this.cy.zoom() / 1.2, duration: 200 }); }
    fitToScreen() { this.cy?.animate({ fit: { eles: this.cy.elements(), padding: 30 }, duration: 300 }); }

    destroy() {
        if (this.layoutTimeout) clearTimeout(this.layoutTimeout);
        this.contextMenu?.destroy();
        this.cy?.destroy();
    }
}
