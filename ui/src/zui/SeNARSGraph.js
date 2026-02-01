import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { GraphSystem } from './GraphSystem.js';
import { SemanticZoom } from './SemanticZoom.js';
import { ContextualWidget } from './ContextualWidget.js';
import { Config } from '../config/Config.js';
import { AutoLearner } from '../utils/AutoLearner.js';
import { ContextMenu } from '../components/ContextMenu.js';
import { KeyboardNavigation } from '../visualization/KeyboardNavigation.js';
import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';

cytoscape.use(fcose);

export class SeNARSGraph extends GraphSystem {
    constructor(container, widgetContainer) {
        super(container);
        this.widgetContainer = widgetContainer || container;
        this.semanticZoom = null;
        this.contextualWidget = null;
        this.autoLearner = new AutoLearner();
        this.options = {};
        this.contextMenu = null;
        this.commandProcessor = null;
        this.callbacks = {}; // For KeyboardNavigation compatibility
        this.keyboardNav = new KeyboardNavigation(this);

        // State
        this.filters = { minPriority: 0, showTasks: true, hideIsolated: false };
        this.traceMode = false;
        this.tracedNode = null;
        this.updatesEnabled = true;
        this._layoutTimeout = null;
        this.currentLayout = 'fcose';

        this._setupGlobalListeners();
    }

    _setupGlobalListeners() {
        eventBus.on(EVENTS.CONCEPT_SELECT, (payload) => {
            const { id, concept } = payload;
            if (concept?.term) this.autoLearner.recordInteraction(concept.term, 1);
            if (id) this.highlightNode(id);
        });

        eventBus.on(EVENTS.GRAPH_FILTER, (payload) => this.applyFilters(payload));
        eventBus.on(EVENTS.SETTINGS_UPDATED, () => {
            this.updateStyle();
            this.scheduleLayout();
        });
    }

    initialize(options = {}) {
        this.options = options;
        const success = super.initialize({
            style: Config.getGraphStyle(),
            layout: Config.getGraphLayout(),
            cytoscapeOptions: {
                minZoom: 0.05,
                maxZoom: 5,
                wheelSensitivity: 0.15
            },
            ...options
        });

        if (success) {
            this.semanticZoom = new SemanticZoom(this);
            this.contextualWidget = new ContextualWidget(this, this.widgetContainer);

            // Fix: ensure container is an element before calling keyboard nav init
            if (this.container && typeof this.container !== 'string') {
                this.keyboardNav.initialize(this.container);
            } else if (typeof this.container === 'string') {
                this.keyboardNav.initialize(document.getElementById(this.container));
            }

            // Interaction Polish: Hover effects
            this._setupHoverEffects();
        }
        return success;
    }

    _setupHoverEffects() {
        if (!this.cy) return;

        this.cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            node.addClass('hovered');

            // Highlight direct neighbors
            node.neighborhood().addClass('neighbor-edge');
            node.neighborhood('node').addClass('neighbor');

            // Optional: Show simplified widget immediately on hover
            // this.contextualWidget.showHoverWidget(node);
        });

        this.cy.on('mouseout', 'node', (evt) => {
            const node = evt.target;
            node.removeClass('hovered');
            node.neighborhood().removeClass('neighbor-edge');
            node.neighborhood('node').removeClass('neighbor');
        });
    }

    focusNode(nodeId) {
        if (!this.cy) return;
        const node = this.cy.getElementById(nodeId);

        if (node.length > 0) {
            this.cy.animate({
                zoom: 1.5,
                center: { eles: node },
                duration: 500,
                easing: 'ease-in-out-cubic'
            });

            // Select and highlight
            this.cy.elements().removeClass('selected keyboard-selected');
            node.addClass('selected');

            // Trigger detailed view event
            const data = this._getNodeData(node);
            eventBus.emit(EVENTS.CONCEPT_SELECT, {
                concept: data.fullData,
                id: nodeId,
                showDetails: true
            });
        }
    }

    // Compatibility method for KeyboardNavigation
    _getNodeData(node) {
        // KeyboardNavigation expects this format
        return {
             type: 'node',
             label: node.data('label'),
             id: node.id(),
             term: node.data('term') || node.data('label'),
             nodeType: node.data('type'),
             fullData: node.data('fullData')
        };
    }

    // Compatibility method for KeyboardNavigation
    updateGraphDetails(data) {
        // Emit concept select event so other components can update
        if (data.fullData) {
            eventBus.emit(EVENTS.CONCEPT_SELECT, {
                concept: data.fullData,
                id: data.id
            });
        }
    }

    // --- Interaction & Events ---

    setCommandProcessor(commandProcessor) {
        if (!commandProcessor) return;
        this.commandProcessor = commandProcessor;
        if (!this.contextMenu) {
            this.contextMenu = new ContextMenu(this, commandProcessor);
        }

        // Listen to contextMenu event from GraphSystem if not already set up
        this.off('contextMenu', this._handleContextMenu.bind(this));
        this.on('contextMenu', this._handleContextMenu.bind(this));
    }

    _handleContextMenu(evt) {
        if (!this.contextMenu) return;
        const { target, originalEvent } = evt;
        if (target && target !== this.cy) {
            const type = target.isNode() ? 'node' : 'edge';
            const pos = originalEvent.renderedPosition || originalEvent.position;
            this.contextMenu.show(pos.x, pos.y, target, type);
        }
    }

    setUpdatesEnabled(enabled) {
        this.updatesEnabled = enabled;
        if (enabled && this.cy) {
            this.resize();
            this.fit();
            this.scheduleLayout();
        }
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

            // Only clear previous trace classes first
            this.cy.elements().removeClass('trace-highlight trace-dim');

            const root = this.cy.getElementById(nodeId);
            const connected = root.union(root.successors()).union(root.predecessors()).union(root.neighborhood());
            const others = this.cy.elements().not(connected);

            this.cy.batch(() => {
                others.addClass('trace-dim');
                connected.addClass('trace-highlight');
            });

            this.cy.animate({ fit: { eles: connected, padding: 50 }, duration: 500 });
        }
    }

    highlightNode(nodeId) {
        if (!this.cy) return;
        const node = typeof nodeId === 'string' ? this.cy.getElementById(nodeId) : nodeId;
        if (!node?.length) return;

        this.cy.elements().removeClass('keyboard-selected');
        node.addClass('keyboard-selected');
        this.cy.animate({ center: { eles: node } }, { duration: 200 });
    }

    // --- Data Management ---

    updateFromMessage(message) {
        if (!this.cy || !this.updatesEnabled) return;

        const handlers = {
            'concept.created': () => this.addNode(message.payload, true),
            'concept.added': () => this.addNode(message.payload, true),
            'concept.updated': () => this.updateNode(message.payload),
            'task.added': () => this.addNode({ ...message.payload, type: 'task' }, true),
            'task.input': () => this.addNode({ ...message.payload, type: 'task' }, true),
            'question.answered': () => this.addQuestionNode(message.payload),
            'memorySnapshot': () => this.updateFromSnapshot(message.payload),
            'link.created': () => this.addEdge(message.payload, true)
        };

        handlers[message.type]?.();
    }

    addNode(data, runLayout = true) {
        if (!this.cy) return false;

        const config = this._createNodeConfig(data);
        if (this.cy.getElementById(config.data.id).length) return false;

        this.cy.add(config);
        this._updateWidget(config.data.id, data);

        // Auto-learn interactions if term provided
        if (data.term) {
             // Just registering existence, interaction is on click
        }

        if (runLayout) this.scheduleLayout();
        return true;
    }

    updateNode(data) {
        if (!this.cy || !data?.id) return;
        const node = this.cy.getElementById(data.id);

        if (node.length > 0) {
            const priority = data.budget?.priority ?? 0;
            const taskCount = data.tasks?.length ?? data.taskCount ?? 0;
            const weight = this._calculateNodeWeight(priority, data.term);

            const updates = {
                weight: weight,
                taskCount: taskCount,
                fullData: data
            };

            if (data.truth) {
                updates.label = this._calculateNodeLabel(data);
            }

            node.data(updates);
            this._updateWidget(data.id, data);
            this.animateUpdate(data.id);
        } else {
            this.addNode(data, false);
        }
    }

    addQuestionNode(data) {
        if (data) {
            this.addNode({
                label: data.answer || data.question || 'Answer',
                type: 'question',
                weight: 40
            }, true);
        }
    }

    updateFromSnapshot(data) {
        if (!this.cy || !data?.concepts) return;
        this.clear();
        data.concepts.forEach(c => this.addNode(c, false));
        if (data.links) data.links.forEach(l => this.addEdge(l, false));
        this.scheduleLayout();
    }

    addEdge(data, runLayout = true) {
        if (!this.cy) return false;

        const config = this._createEdgeConfig(data);
        if (this.cy.getElementById(config.data.id).length) return false;

        if (this.cy.getElementById(config.data.source).empty() ||
            this.cy.getElementById(config.data.target).empty()) {
            return false;
        }

        this.cy.add(config);

        if (runLayout) this.scheduleLayout();
        return true;
    }

    _createNodeConfig(data) {
        const { id, type, term } = data;
        const nodeId = id ?? `concept_${Date.now()}_${Math.random()}`;
        const displayLabel = this._calculateNodeLabel(data);
        const priority = data.budget?.priority ?? 0.5;
        const taskCount = data.tasks?.length ?? data.taskCount ?? 0;
        const weight = this._calculateNodeWeight(priority, term);

        return {
            group: 'nodes',
            data: {
                id: nodeId,
                label: displayLabel,
                type: type ?? 'concept',
                weight: weight,
                taskCount: taskCount,
                fullData: data,
                term: term
            }
        };
    }

    _createEdgeConfig(data) {
        const { id, source, target, label, type } = data;
        const edgeId = id ?? `edge_${source}_${target}_${type}_${Math.random()}`;

        return {
            group: 'edges',
            data: {
                id: edgeId,
                source,
                target,
                label: label ?? type ?? 'related',
                type: type ?? 'relationship'
            }
        };
    }

    _calculateNodeLabel(data) {
        const { label, term, id, truth } = data;
        let displayLabel = label ?? term ?? id;
        return displayLabel;
    }

    _calculateNodeWeight(priority, term) {
        let weight = (priority * 50) + 20;
        if (term) weight += this.autoLearner.getConceptModifier(term);
        return Math.min(Math.max(weight, 10), 100);
    }

    _updateWidget(nodeId, data) {
        if (!this.contextualWidget) return;

        const priority = data.budget?.priority;
        const truth = data.truth;

        let html = '';
        if (priority !== undefined && typeof priority === 'number') html += `<div>Prio: ${priority.toFixed(2)}</div>`;
        if (truth && truth.frequency !== undefined && truth.confidence !== undefined) {
             html += `<div>{${Number(truth.frequency).toFixed(2)}, ${Number(truth.confidence).toFixed(2)}}</div>`;
        }

        if (html) {
            this.contextualWidget.attach(nodeId, html);
        }
    }

    // --- Layouts & Filters ---

    setLayout(name) {
        if (!this.cy) return;
        this.currentLayout = name;
        super.layout(Config.getGraphLayout(name));
    }

    applyScatterLayout(xAxis = 'priority', yAxis = 'confidence') {
        if (!this.cy) return;
        this.currentLayout = 'scatter';

        const nodes = this.cy.nodes();
        const width = this.cy.width() * 0.8;
        const height = this.cy.height() * 0.8;

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
            const posX = (x - 0.5) * width;
            const posY = -(y - 0.5) * height;
            node.position({ x: posX, y: posY });
        });

        this.fit();
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
            return getVal(b) - getVal(a);
        });

        nodes.layout({
            name: 'grid',
            avoidOverlap: true,
            padding: 30
        }).run();
    }

    applyFilters(filters) {
        if (!this.cy) return;
        this.filters = { ...this.filters, ...filters };

        this.cy.batch(() => {
            this.cy.nodes().forEach(node => {
                const data = node.data('fullData') || {};
                const type = node.data('type');
                const priority = data.budget?.priority ?? 0;

                let visible = true;
                if (type === 'task' && !this.filters.showTasks) visible = false;
                if (priority < this.filters.minPriority) visible = false;
                if (this.filters.hideIsolated && node.degree() === 0) visible = false;

                node.style('display', visible ? 'element' : 'none');
            });
        });
    }

    scheduleLayout() {
        if (this._layoutTimeout) clearTimeout(this._layoutTimeout);
        this._layoutTimeout = setTimeout(() => {
            if (this.cy && this.updatesEnabled) {
                if (this.currentLayout !== 'scatter' && this.currentLayout !== 'sorted-grid') {
                    super.layout(Config.getGraphLayout(this.currentLayout || 'fcose'));
                }
            }
        }, 500);
    }

    updateStyle() {
        this.cy?.style(Config.getGraphStyle());
    }

    // --- Visual Effects ---

    animateUpdate(nodeId) {
        const node = this.cy?.getElementById(nodeId);
        if (!node?.length) return;

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

    animateFadeIn(nodeId) {
        const node = this.cy?.getElementById(nodeId);
        if (!node?.length) return;
        node.style('opacity', 0);
        node.animate({ style: { 'opacity': 1 }, duration: 500 });
    }

    clear() {
        super.clear();
        this.contextualWidget?.clear();
    }

    fitToScreen() {
        this.fit(undefined, 30);
    }
}
