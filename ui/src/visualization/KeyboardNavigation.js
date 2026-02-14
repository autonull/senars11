/**
 * Handles keyboard navigation for the graph visualization
 */
export class KeyboardNavigation {
    constructor(graphManager) {
        this.graphManager = graphManager;
        this.kbState = { index: 0, selectedNode: null };
    }

    initialize(container) {
        if (!container) return;
        container.setAttribute('tabindex', '0');
        container.setAttribute('role', 'application');
        container.setAttribute('aria-label', 'SeNARS concept graph visualization');
        container.addEventListener('keydown', (e) => this._handleKeyboardEvent(e));
    }

    _handleKeyboardEvent(e) {
        if (!this.graphManager.cy) return;
        const nodes = this.graphManager.cy.nodes(':visible');
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
        this.graphManager.highlightNode(this.kbState.selectedNode);
    }

    _navigateNeighbors(nodes) {
        const { selectedNode } = this.kbState;
        if (selectedNode) {
            const connected = selectedNode.neighborhood('node:visible');
            if (connected.length > 0) {
                const nextNode = connected[0];
                this.kbState.selectedNode = nextNode;
                this.graphManager.highlightNode(nextNode);
            }
        } else {
            this.kbState.selectedNode = nodes[0];
            this.kbState.index = 0;
            this.graphManager.highlightNode(this.kbState.selectedNode);
        }
    }

    _selectCurrentNode() {
        const node = this.kbState.selectedNode;
        if (node) {
            const data = this.graphManager._getNodeData(node);
            this.graphManager.updateGraphDetails(data);
            this.graphManager.callbacks.onNodeClick?.(data);
        }
    }

    _clearSelection() {
        if (this.kbState.selectedNode) {
            this.graphManager.cy.elements().removeClass('keyboard-selected');
            this.kbState.selectedNode = null;
        }
    }
}
