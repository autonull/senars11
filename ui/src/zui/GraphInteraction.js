import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';
import { ContextMenu } from '../components/ContextMenu.js';

export class GraphInteraction {
    constructor(cy, autoLearner, contextualWidget, getNodeData) {
        this._cy = cy;
        this._autoLearner = autoLearner;
        this._contextualWidget = contextualWidget;
        this._getNodeData = getNodeData;
        this.contextMenu = null;
        this.commandProcessor = null;
        this.historyStack = [];
        this.traceMode = false;
        this.tracedNode = null;
    }

    get cy() { return this._cy; }
    set cy(val) { this._cy = val; }

    setupHoverEffects() {
        if (!this._cy) return;
        this._cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            node.addClass('hovered');
            node.neighborhood().addClass('neighbor-edge');
            node.neighborhood('node').addClass('neighbor');
            this._contextualWidget?.showHoverFrame(node);
        });
        this._cy.on('mouseout', 'node', (evt) => {
            const node = evt.target;
            node.removeClass('hovered');
            node.neighborhood().removeClass('neighbor-edge');
            node.neighborhood('node').removeClass('neighbor');
            this._contextualWidget?.hideHoverFrame();
        });
    }

    flyTo(nodeId) {
        if (!this._cy) return;
        const node = this._cy.getElementById(nodeId);
        if (node.empty()) return;

        this.historyStack.push({
            zoom: this._cy.zoom(),
            pan: { ...this._cy.pan() },
            time: Date.now()
        });
        if (this.historyStack.length > 20) this.historyStack.shift();

        this._cy.animate({
            zoom: 2.5,
            center: { eles: node },
            duration: 800,
            easing: 'ease-in-out-cubic'
        });

        this._emitConceptSelect(nodeId);
    }

    goBack() {
        if (!this._cy || this.historyStack.length === 0) return;
        const state = this.historyStack.pop();
        this._cy.animate({
            zoom: state.zoom,
            pan: state.pan,
            duration: 600,
            easing: 'ease-in-out-cubic'
        });
    }

    focusNode(nodeId) {
        if (!this._cy) return;
        const node = this._cy.getElementById(nodeId);
        if (node.length > 0) {
            this._cy.animate({
                zoom: 1.5,
                center: { eles: node },
                duration: 500,
                easing: 'ease-in-out-cubic'
            });
            this._cy.elements().removeClass('selected keyboard-selected');
            node.addClass('selected');
            this._emitConceptSelect(nodeId, true);
        }
    }

    enterNode(nodeId) {
        if (!this._cy) return;
        const node = this._cy.getElementById(nodeId);
        if (node.length > 0) {
            this._cy.animate({
                zoom: 4.0,
                center: { eles: node },
                duration: 800,
                easing: 'ease-out-expo'
            });
            node.addClass('selected');
        }
    }

    highlightNode(nodeId) {
        if (!this._cy) return;
        const node = typeof nodeId === 'string' ? this._cy.getElementById(nodeId) : nodeId;
        if (!node?.length) return;
        this._cy.elements().removeClass('keyboard-selected');
        node.addClass('keyboard-selected');
        this._cy.animate({ center: { eles: node } }, { duration: 200 });
    }

    toggleTraceMode(nodeId) {
        if (!this._cy) return;
        if (this.traceMode && this.tracedNode === nodeId) {
            this.traceMode = false;
            this.tracedNode = null;
            this._cy.elements().removeClass('trace-highlight trace-dim');
        } else {
            this.traceMode = true;
            this.tracedNode = nodeId;
            this._cy.elements().removeClass('trace-highlight trace-dim');
            const root = this._cy.getElementById(nodeId);
            const connected = root.union(root.successors()).union(root.predecessors()).union(root.neighborhood());
            const others = this._cy.elements().not(connected);
            this._cy.batch(() => {
                others.addClass('trace-dim');
                connected.addClass('trace-highlight');
            });
            this._cy.animate({ fit: { eles: connected, padding: 50 }, duration: 500 });
        }
    }

    traceDerivationPath(nodeId) {
        if (!this._cy) return;
        const node = this._cy.getElementById(nodeId);
        if (node.empty()) return;

        const predecessors = node.predecessors();
        const edges = predecessors.filter('edge');
        const nodes = predecessors.filter('node').union(node);

        this._cy.batch(() => {
            this._cy.elements().removeClass('trace-highlight trace-dim');
            this._cy.elements().not(nodes.union(edges)).addClass('trace-dim');
            nodes.addClass('trace-highlight');
            edges.addClass('trace-highlight');
        });
        this._cy.animate({ fit: { eles: nodes.union(edges), padding: 50 }, duration: 800 });
    }

    setCommandProcessor(commandProcessor, graphInstance) {
        if (!commandProcessor) return;
        this.commandProcessor = commandProcessor;
        if (!this.contextMenu) {
            this.contextMenu = new ContextMenu(graphInstance, commandProcessor);
        }
        graphInstance.off('contextMenu', graphInstance._handleContextMenu.bind(graphInstance));
        graphInstance.on('contextMenu', graphInstance._handleContextMenu.bind(graphInstance));
    }

    handleContextMenu(evt) {
        if (!this.contextMenu) return;
        const { target, originalEvent } = evt;
        if (target && target !== this._cy) {
            const type = target.isNode() ? 'node' : 'edge';
            const pos = originalEvent.renderedPosition || originalEvent.position;
            this.contextMenu.show(pos.x, pos.y, target, type);
        }
    }

    _emitConceptSelect(nodeId, showDetails = false) {
        const node = this._cy.getElementById(nodeId);
        const data = this._getNodeData(node);
        if (data?.term) this._autoLearner.recordInteraction(data.term, 1);
        eventBus.emit(EVENTS.CONCEPT_SELECT, {
            concept: data?.fullData,
            id: nodeId,
            showDetails
        });
    }
}
