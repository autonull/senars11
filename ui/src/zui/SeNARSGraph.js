import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { GraphSystem } from './GraphSystem.js';
import { SemanticZoom } from './SemanticZoom.js';
import { ContextualWidget } from './ContextualWidget.js';
import { Config } from '../config/Config.js';
import { AutoLearner } from '../utils/AutoLearner.js';
import { KeyboardNavigation } from '../visualization/KeyboardNavigation.js';
import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';
import { GraphRenderer } from './GraphRenderer.js';
import { GraphInteraction } from './GraphInteraction.js';
import { BagVisualizer } from './BagVisualizer.js';

cytoscape.use(fcose);

export class SeNARSGraph extends GraphSystem {
    constructor(container, widgetContainer) {
        super(container);
        this.widgetContainer = widgetContainer || container;
        this.semanticZoom = null;
        this.contextualWidget = null;
        this.autoLearner = new AutoLearner();
        this.options = {};
        this.keyboardNav = new KeyboardNavigation(this);
        this.filters = { minPriority: 0, showTasks: true, showConcepts: true, hideIsolated: false };
        this.updatesEnabled = true;

        this.visSettings = {
            edgeSpeed: 1.0,
            showDerivations: true,
            colorCodeRules: false,
            traceDecay: 2000,
            attentionSpotlight: false,
            inferenceTypeColors: {
                'Deduction': '#00ff9d', 'Induction': '#00d4ff', 'Abduction': '#ffcc00',
                'Revision': '#ff4444', 'Analogy': '#ff00ff', 'Inference': '#FFaa00'
            }
        };

        this._setupGlobalListeners();
    }

    _setupGlobalListeners() {
        eventBus.on('visualization.settings', (settings) => { this.visSettings = { ...this.visSettings, ...settings }; });
        eventBus.on(EVENTS.CONCEPT_SELECT, (payload) => {
            if (payload.concept?.term) {this.autoLearner.recordInteraction(payload.concept.term, 1);}
            if (payload.id) {this.highlightNode(payload.id);}
        });
        eventBus.on(EVENTS.GRAPH_FILTER, (payload) => this.applyFilters(payload));
        eventBus.on(EVENTS.SETTINGS_UPDATED, () => { this.updateStyle(); this.scheduleLayout(); });
    }

    initialize(options = {}) {
        this.options = options;
        if (options.useBag) {this._bagVisualizer.initialize(options.bagCapacity || 50);}

        const success = super.initialize({
            style: options.style || Config.getGraphStyle(),
            layout: Config.getGraphLayout(),
            cytoscapeOptions: { minZoom: 0.05, maxZoom: 5, wheelSensitivity: 0.15 },
            ...options
        });

        if (success) {
            this.semanticZoom = new SemanticZoom(this);
            this.contextualWidget = new ContextualWidget(this, this.widgetContainer);
            this._renderer.cy = this.cy;
            this._interaction.cy = this.cy;
            this._bagVisualizer.cy = this.cy;

            if (this.container && typeof this.container !== 'string') {
                this.keyboardNav.initialize(this.container);
            } else if (typeof this.container === 'string') {
                this.keyboardNav.initialize(document.getElementById(this.container));
            }

            this.cy.on('layoutstop', () => this.cy.fit(undefined, 30));
            this._interaction.setupHoverEffects();
        }
        return success;
    }

    get _renderer() { return this._graphRenderer || (this._graphRenderer = new GraphRenderer(null, this.autoLearner)); }
    get _interaction() { return this._graphInteraction || (this._graphInteraction = new GraphInteraction(null, this.autoLearner, null, (n) => this._getNodeData(n))); }
    get _bagVisualizer() { return this._bagVis || (this._bagVis = new BagVisualizer(null,
        (d) => this._createNodeConfig(d),
        (p, t) => this._calculateNodeWeight(p, t),
        (id, d) => this._updateWidget(id, d),
        () => this.scheduleLayout()
    )); }

    get bag() { return this._bagVisualizer.bag; }
    set bag(val) { this._bagVisualizer.bag = val; }
    get historyStack() { return this._interaction.historyStack; }
    get currentLayout() { return this._renderer.currentLayout; }
    set currentLayout(val) { this._renderer.currentLayout = val; }
    get traceMode() { return this._interaction.traceMode; }
    set traceMode(val) { this._interaction.traceMode = val; }
    get tracedNode() { return this._interaction.tracedNode; }
    set tracedNode(val) { this._interaction.tracedNode = val; }
    get contextMenu() { return this._interaction.contextMenu; }
    set contextMenu(val) { this._interaction.contextMenu = val; }
    get commandProcessor() { return this._interaction.commandProcessor; }
    set commandProcessor(val) { this._interaction.commandProcessor = val; }

    flyTo(nodeId) { this._interaction.flyTo(nodeId); }
    goBack() { this._interaction.goBack(); }
    focusNode(nodeId) { this._interaction.focusNode(nodeId); }
    enterNode(nodeId) { this._interaction.enterNode(nodeId); }
    highlightNode(nodeId) { this._interaction.highlightNode(nodeId); }
    toggleTraceMode(nodeId) { this._interaction.toggleTraceMode(nodeId); }
    traceDerivationPath(nodeId) { this._interaction.traceDerivationPath(nodeId); }
    updateGraphDetails(data) {
        if (data.fullData) {eventBus.emit(EVENTS.CONCEPT_SELECT, { concept: data.fullData, id: data.id });}
    }

    setCommandProcessor(commandProcessor) { this._interaction.setCommandProcessor(commandProcessor, this); }
    _handleContextMenu(evt) { this._interaction.handleContextMenu(evt); }

    setUpdatesEnabled(enabled) {
        this.updatesEnabled = enabled;
        if (enabled && this.cy) { this.resize(); this.fit(); this.scheduleLayout(); }
    }

    _getNodeData(node) {
        if (!node || node.empty()) {return null;}
        const data = node.data();
        const fullData = data.fullData || {};
        return {
            ...data, ...fullData, id: node.id(),
            term: data.term || data.label || node.id(),
            type: data.type || 'concept',
            derivation: fullData.derivation || data.derivation,
            budget: fullData.budget || data.budget,
            truth: fullData.truth || data.truth
        };
    }

    updateFromMessage(message) {
        if (!this.cy || !this.updatesEnabled) {return;}
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

    removeNode(id) { this.removeNodes([id]); }
    removeNodes(ids) {
        if (!Array.isArray(ids)) {ids = [ids];}
        if (this.bag) {this._bagVisualizer.removeNodesFromBag(ids);}
        else if (this.cy) {
            this.cy.batch(() => {
                ids.forEach(id => {
                    const node = this.cy.getElementById(id);
                    if (node.nonempty()) {this.cy.remove(node);}
                });
            });
        }
    }

    addNode(data, runLayout = true) {
        if (!this.cy) {return false;}
        const config = this._createNodeConfig(data);
        const {id} = config.data;
        if (this.bag) {return this._bagVisualizer.addNodeToBag(id, data);}
        if (this.cy.getElementById(id).length) {return false;}
        this.cy.add(config);
        this._updateWidget(id, data);
        if (runLayout) {this.scheduleLayout();}
        return true;
    }

    updateNode(data) {
        if (this.bag) { if (this._bagVisualizer.updateNodeInBag(data.id, data)) {return;} }
        if (!this.cy || !data?.id) {return;}
        const node = this.cy.getElementById(data.id);
        if (node.length > 0) {
            const existingFullData = node.data('fullData') || {};
            const newFullData = {
                ...existingFullData, ...data,
                budget: { ...existingFullData.budget, ...data.budget },
                truth: { ...existingFullData.truth, ...data.truth },
                derivation: data.derivation || existingFullData.derivation
            };
            const priority = newFullData.budget?.priority ?? 0;
            const taskCount = newFullData.tasks?.length ?? newFullData.taskCount ?? 0;
            const weight = this._calculateNodeWeight(priority, newFullData.term);
            const updates = { weight, taskCount, fullData: newFullData, priority, derivation: newFullData.derivation };
            if (newFullData.truth) {updates.label = this._calculateNodeLabel(newFullData);}
            node.data(updates);
            this._updateWidget(data.id, newFullData);
            this._renderer.animateUpdate(data.id);
        } else {
            this.addNode(data, false);
        }
    }

    addQuestionNode(data) {
        if (data) {this.addNode({
            label: data.answer || data.question || 'Answer',
            type: 'question', weight: 40
        }, true);}
    }

    updateFromSnapshot(data) {
        if (!this.cy || !data?.concepts) {return;}
        this.clear();
        data.concepts.forEach(c => this.addNode(c, false));
        if (data.links) {data.links.forEach(l => this.addEdge(l, false));}
        this.scheduleLayout();
    }

    addEdge(data, runLayout = true) {
        if (!this.cy) {return false;}
        const config = this._createEdgeConfig(data);
        if (this.cy.getElementById(config.data.id).length) {return false;}
        if (this.cy.getElementById(config.data.source).empty() || this.cy.getElementById(config.data.target).empty()) {return false;}
        this.cy.add(config);
        if (runLayout) {this.scheduleLayout();}
        return true;
    }

    _createNodeConfig(data) {
        const { id, type, term, position } = data;
        const nodeId = id ?? `concept_${Date.now()}_${Math.random()}`;
        const displayLabel = this._calculateNodeLabel(data);
        const priority = data.budget?.priority ?? 0.5;
        const taskCount = data.tasks?.length ?? data.taskCount ?? 0;
        const weight = this._calculateNodeWeight(priority, term);

        let initialPos = position;
        if (!initialPos) {
            const range = 500;
            initialPos = { x: (Math.random() - 0.5) * range, y: (Math.random() - 0.5) * range };
            if (this.cy && this.cy.nodes().nonempty()) {
                const extent = this.cy.extent();
                if (extent && extent.w > 0) {
                    const cx = (extent.x1 + extent.x2) / 2;
                    const cy = (extent.y1 + extent.y2) / 2;
                    initialPos = { x: cx + (Math.random() - 0.5) * (extent.w * 0.5), y: cy + (Math.random() - 0.5) * (extent.h * 0.5) };
                }
            }
        }

        return {
            group: 'nodes',
            data: { id: nodeId, label: displayLabel, type: type ?? 'concept', weight, taskCount, fullData: data, term },
            position: initialPos
        };
    }

    _createEdgeConfig(data) {
        const { id, source, target, label, type } = data;
        return {
            group: 'edges',
            data: {
                id: id ?? `edge_${source}_${target}_${type}_${Math.random()}`,
                source, target,
                label: label ?? type ?? 'related',
                type: type ?? 'relationship'
            }
        };
    }

    _calculateNodeLabel(data) { return this._renderer.calculateNodeLabel(data); }
    _calculateNodeWeight(priority, term) { return this._renderer.calculateNodeWeight(priority, term); }

    _updateWidget(nodeId, data) {
        if (!this.contextualWidget) {return;}
        if (data.widgetContent) {
            this.contextualWidget.attach(nodeId, data.widgetContent, data.widgetOptions);
            return;
        }
        if (data.showWidget) {
            const priority = data.budget?.priority;
            const {truth} = data;
            let html = '';
            if (priority !== undefined && typeof priority === 'number') {html += `<div>Prio: ${priority.toFixed(2)}</div>`;}
            if (truth && truth.frequency !== undefined && truth.confidence !== undefined) {
                html += `<div>{${Number(truth.frequency).toFixed(2)}, ${Number(truth.confidence).toFixed(2)}}</div>`;
            }
            if (html) {this.contextualWidget.attach(nodeId, html);}
        }
    }

    setLayout(name) {
        if (!this.cy) {return;}
        const layoutOpts = this._renderer.setLayout(name);
        super.layout(layoutOpts);
    }

    applyScatterLayout(xAxis, yAxis) { this._renderer.applyScatterLayout(xAxis, yAxis); }
    applySortedGridLayout(sortField) { this._renderer.applySortedGridLayout(sortField); }

    applyFilters(filters) {
        if (!this.cy) {return;}
        this.filters = { ...this.filters, ...filters };
        this.cy.batch(() => {
            this.cy.nodes().forEach(node => {
                const data = node.data('fullData') || {};
                const type = node.data('type');
                const priority = data.budget?.priority ?? 0;
                const isTask = type === 'task';
                const isConcept = type === 'concept' || !type;
                const isIsolated = node.degree() === 0;
                const visible = (!isTask || this.filters.showTasks) && (!isConcept || this.filters.showConcepts) &&
                    (priority >= this.filters.minPriority) && (!isIsolated || !this.filters.hideIsolated);
                node.style('display', visible ? 'element' : 'none');
            });
        });
    }

    scheduleLayout() { this._renderer.scheduleLayout((opts) => super.layout(opts)); }
    updateStyle() { this._renderer.updateStyle(); }
    animateUpdate(nodeId) { this._renderer.animateUpdate(nodeId); }
    animateReasoning(sourceId, targetId, derivedId, ruleType) {
        this._renderer.animateReasoning(sourceId, targetId, derivedId, ruleType, this.visSettings);
    }
    animateAttention(nodeId) { this._renderer.animateAttention(nodeId); }
    animateFadeIn(nodeId) { this._renderer.animateFadeIn(nodeId); }

    clear() {
        super.clear();
        this._bagVisualizer.clear();
        this.contextualWidget?.clear();
    }

    fitToScreen() { this.fit(undefined, 30); }
    processDecay(factor, threshold) { return this._bagVisualizer.processDecay(factor, threshold); }
}
