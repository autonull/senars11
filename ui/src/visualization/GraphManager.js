import { Config } from '../config/Config.js';
import { ContextMenu } from '../components/ContextMenu.js';
import { AutoLearner } from '../utils/AutoLearner.js';
import { KeyboardNavigation } from './KeyboardNavigation.js';

export class GraphManager {
    constructor(uiElements = null, callbacks = {}) {
        this.cy = null;
        this.uiElements = uiElements;
        this.callbacks = callbacks;
        this.layoutTimeout = null;
        this.pendingLayout = false;
        this.updatesEnabled = false;
        this.traceMode = false;
        this.tracedNode = null;
        this.filters = { minPriority: 0, showTasks: true };
        this.contextMenu = null;
        this.autoLearner = new AutoLearner();
        this.keyboardNav = new KeyboardNavigation(this);

        this._setupGlobalListeners();
    }

    _setupGlobalListeners() {
        document.addEventListener('senars:concept:select', (e) => {
            const { id, concept } = e.detail;
            if (concept?.term) this.autoLearner.recordInteraction(concept.term, 1);
            if (id) this.highlightNode(id);
        });

        document.addEventListener('senars:graph:filter', (e) => this.applyFilters(e.detail));
        document.addEventListener('senars:settings:updated', () => {
            this.updateStyle();
            this.runLayout();
        });
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
                layout: Config.getGraphLayout(),
                minZoom: 0.1,
                maxZoom: 5,
                wheelSensitivity: 0.2
            });
        } catch (error) {
            console.error('Failed to initialize Cytoscape:', error);
            return false;
        }

        this.keyboardNav.initialize(this.uiElements.graphContainer);
        if (this.callbacks.commandProcessor) {
            this.setCommandProcessor(this.callbacks.commandProcessor);
        }

        this._setupInteractionEvents();
        return true;
    }

    _setupInteractionEvents() {
        if (!this.cy) return;

        this.cy.on('tap', 'node', (event) => this._handleNodeClick(event));
        this.cy.on('tap', 'edge', (event) => this._handleEdgeClick(event));
        this.cy.on('cxttap', 'node', (e) => this._handleContext(e, 'node'));
        this.cy.on('cxttap', 'edge', (e) => this._handleContext(e, 'edge'));
        this.cy.on('dbltap', 'node', (event) => this._handleNodeDoubleClick(event));
    }

    _handleNodeClick(event) {
        const node = event.target;
        const data = this._getNodeData(node);
        this.callbacks.onNodeClick?.(data);

        if (data.fullData) {
            document.dispatchEvent(new CustomEvent('senars:concept:select', {
                detail: { concept: data.fullData, id: data.id }
            }));
        }

        if (event.originalEvent.shiftKey) this.toggleTraceMode(data.id);
    }

    _handleNodeDoubleClick(event) {
        const node = event.target;
        this.cy.animate({ center: { eles: node }, zoom: 2, duration: 300 });
        this.animateGlow(node.id(), 1.0);
        this.toggleTraceMode(node.id());
    }

    _handleEdgeClick(event) {
        // Placeholder for edge details
    }

    _handleContext(event, type) {
        event.preventDefault();
        if (this.contextMenu) {
            const pos = event.renderedPosition || event.position;
            this.contextMenu.show(pos.x, pos.y, event.target, type);
        }
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
        this.currentLayout = name;
        this.cy.layout(Config.getGraphLayout(name)).run();
    }

    applyScatterLayout(xAxis = 'priority', yAxis = 'confidence') {
        if (!this.cy) return;
        this.currentLayout = 'scatter';

        const nodes = this.cy.nodes();
        const width = this.cy.width() * 0.8;
        const height = this.cy.height() * 0.8;
        const padding = 50;

        const getVal = (node, axis) => {
            const data = node.data('fullData') || {};
            const truth = data.truth || {};
            const budget = data.budget || {};

            switch (axis) {
                case 'priority': return budget.priority || 0;
                case 'durability': return budget.durability || 0;
                case 'quality': return budget.quality || 0;
                case 'frequency': return truth.frequency || 0;
                case 'confidence': return truth.confidence || 0;
                case 'taskCount': return Math.min((data.tasks?.length || 0) / 20, 1);
                default: return 0;
            }
        };

        nodes.forEach(node => {
            const x = getVal(node, xAxis);
            const y = getVal(node, yAxis);

            // Map 0-1 to screen coordinates
            // X: 0 -> -width/2, 1 -> width/2
            // Y: 0 -> height/2, 1 -> -height/2 (SVG coords are inverted for Y)
            const posX = (x - 0.5) * width;
            const posY = -(y - 0.5) * height; // Invert Y so high values are at top

            node.position({ x: posX, y: posY });
        });

        this.cy.fit();
    }

    applySortedGridLayout(sortField = 'priority') {
        if (!this.cy) return;
        this.currentLayout = 'sorted-grid';

        const nodes = this.cy.nodes().sort((a, b) => {
            const getVal = (n) => {
                 const d = n.data('fullData') || {};
                 if (sortField === 'priority') return d.budget?.priority || 0;
                 if (sortField === 'term') return n.id();
                 return 0;
            };
            // Descending order
            return getVal(b) - getVal(a);
        });

        nodes.layout({
            name: 'grid',
            rows: undefined,
            cols: undefined,
            avoidOverlap: true,
            padding: 30
        }).run();
    }

    applyFilters(filters) {
        if (!this.cy) return;
        this.filters = { ...this.filters, ...filters };

        this.cy.batch(() => {
            this.cy.nodes().forEach(node => {
                const data = node.data('fullData');
                const type = node.data('type');
                const priority = data?.budget?.priority ?? 0;

                let visible = true;
                if (type === 'task' && !this.filters.showTasks) visible = false;
                if (priority < this.filters.minPriority) visible = false;
                if (this.filters.hideIsolated && node.degree() === 0) visible = false;

                node.style('display', visible ? 'element' : 'none');
            });
        });
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

    _getNodeData(node) {
        return {
            type: 'node',
            label: node.data('label'),
            id: node.id(),
            term: node.data('fullData')?.term || node.data('label'),
            nodeType: node.data('type'),
            fullData: node.data('fullData')
        };
    }

    highlightNode(nodeId) {
        if (!this.cy) return;
        const node = typeof nodeId === 'string' ? this.cy.getElementById(nodeId) : nodeId;
        if (!node?.length) return;

        this.cy.elements().removeClass('keyboard-selected');
        node.addClass('keyboard-selected');
        this.cy.animate({ center: { eles: node } }, { duration: 200 });
    }

    setCommandProcessor(commandProcessor) {
        if (!commandProcessor) return;
        this.callbacks.commandProcessor = commandProcessor;
        if (!this.contextMenu) {
            this.contextMenu = new ContextMenu(this, commandProcessor);
        }
    }

    addNode(nodeData, runLayout = true) {
        if (!this.cy) return false;

        const { id, label, term, type, truth } = nodeData;
        const nodeId = id ?? `concept_${Date.now()}`;

        if (this.cy.getElementById(nodeId).length) return false;

        let displayLabel = label ?? term ?? id;
        if (truth) {
            displayLabel += `\n{${(truth.frequency ?? 0).toFixed(2)}, ${(truth.confidence ?? 0).toFixed(2)}}`;
        }

        const priority = nodeData.budget?.priority ?? 0;
        const taskCount = nodeData.tasks?.length ?? nodeData.taskCount ?? 0;

        let weight = priority * 100;
        if (term) weight += this.autoLearner.getConceptModifier(term);

        this.cy.add({
            group: 'nodes',
            data: {
                id: nodeId,
                label: displayLabel,
                type: type ?? 'concept',
                weight: Math.min(Math.max(weight, 10), 100),
                taskCount: taskCount,
                fullData: nodeData
            }
        });

        if (runLayout) this.scheduleLayout();
        return true;
    }

    addEdge(edgeData, runLayout = true) {
        if (!this.cy) return false;

        const { id, source, target, label, type } = edgeData;
        const edgeId = id ?? `edge_${Date.now()}_${source}_${target}`;

        if (this.cy.getElementById(edgeId).length) return false;

        this.cy.add({
            group: 'edges',
            data: {
                id: edgeId,
                source,
                target,
                label: label ?? 'Relationship',
                type: type ?? 'relationship'
            }
        });

        if (runLayout) this.scheduleLayout();
        return true;
    }

    updateFromMessage(message) {
        if (!this.cy || !this.updatesEnabled) return;

        const handlers = {
            'concept.created': () => this.addNode(message.payload, true),
            'concept.added': () => this.addNode(message.payload, true),
            'concept.updated': () => this.updateNode(message.payload),
            'task.added': () => this.addNode({ ...message.payload, type: 'task' }, true),
            'task.input': () => this.addNode({ ...message.payload, type: 'task' }, true),
            'question.answered': () => this.addQuestionNode(message.payload),
            'memorySnapshot': () => this.updateFromSnapshot(message.payload)
        };

        handlers[message.type]?.();
    }

    updateNode(payload) {
        if (!this.cy || !payload?.id) return;
        const node = this.cy.getElementById(payload.id);

        if (node.length > 0) {
            const priority = payload.budget?.priority ?? 0;
            const taskCount = payload.tasks?.length ?? payload.taskCount ?? 0;
            let weight = priority * 100;
            if (payload.term) weight += this.autoLearner.getConceptModifier(payload.term);

            const updates = {
                weight: Math.min(Math.max(weight, 10), 100),
                taskCount: taskCount,
                fullData: payload
            };

            if (payload.truth) {
                let displayLabel = payload.term ?? payload.label ?? payload.id;
                displayLabel += `\n{${(payload.truth.frequency ?? 0).toFixed(2)}, ${(payload.truth.confidence ?? 0).toFixed(2)}}`;
                updates.label = displayLabel;
            }

            node.data(updates);
            this.animateUpdate(payload.id);
        } else {
            this.addNode(payload, false);
        }
    }

    addQuestionNode(payload) {
        if (payload) {
            this.addNode({
                label: payload.answer || payload.question || 'Answer',
                type: 'question',
                weight: 40
            }, true);
        }
    }

    updateFromSnapshot(payload) {
        if (!this.cy || !payload?.concepts) return;
        this.cy.elements().remove();
        payload.concepts.forEach(c => this.addNode(c, false));
        this.scheduleLayout();
    }

    animateUpdate(nodeId) {
        const node = this.cy?.getElementById(nodeId);
        if (!node?.length) return;

        // Flash effect
        node.animation({
            style: { 'border-width': 6, 'border-color': '#00ff9d' },
            duration: 100
        }).play().promise().then(() => {
            node.animation({
                style: { 'border-width': 2 },
                duration: 300
            }).play();
        });
    }

    animateGlow(nodeId, intensity = 1.0) {
        this.cy?.getElementById(nodeId)?.animate({ style: { 'opacity': 0.5 + intensity * 0.5 }, duration: 300 });
    }

    scheduleLayout() {
        if (this.pendingLayout) return;
        this.pendingLayout = true;
        if (this.layoutTimeout) clearTimeout(this.layoutTimeout);
        this.layoutTimeout = setTimeout(() => {
            if (this.cy) {
                this.cy.layout(Config.getGraphLayout()).run();
            }
            this.pendingLayout = false;
        }, 500); // Increased debounce to reduce jitter
    }

    updateStyle() {
        this.cy?.style(Config.getGraphStyle());
    }

    clear() {
        this.cy?.elements().remove();
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
