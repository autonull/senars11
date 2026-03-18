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
        // Do not interfere if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }

        if (!this.graphManager.cy) return;
        const nodes = this.graphManager.cy.nodes(':visible');
        // Allow pan/zoom even if no nodes, but navigation requires nodes

        switch (e.key) {
            case 'Tab':
                if (nodes.length) { e.preventDefault(); this._cycleNodes(nodes, e.shiftKey); }
                break;
            case 'ArrowUp': case 'w':
                e.preventDefault(); this._handleDirection('up', nodes); break;
            case 'ArrowDown': case 's':
                e.preventDefault(); this._handleDirection('down', nodes); break;
            case 'ArrowLeft': case 'a':
                e.preventDefault(); this._handleDirection('left', nodes); break;
            case 'ArrowRight': case 'd':
                e.preventDefault(); this._handleDirection('right', nodes); break;
            case 'Enter':
                e.preventDefault();
                if (e.shiftKey && this.kbState.selectedNode) {
                    this.graphManager.enterNode?.(this.kbState.selectedNode.id());
                } else {
                    this._selectCurrentNode();
                }
                break;
            case 'Escape': e.preventDefault(); this._clearSelection(); break;
            case '+': case '=':
                this.graphManager.zoomIn();
                break;
            case '-': case '_':
                this.graphManager.zoomOut();
                break;
        }
    }

    _handleDirection(dir, nodes) {
        if (this.kbState.selectedNode) {
            this._navigateNeighbors(nodes); // Keep existing logic for now, could refine to use dir
        } else {
            // Pan camera if no node selected
            const panAmount = 50;
            const pan = { x: 0, y: 0 };
            if (dir === 'up') pan.y = panAmount;
            if (dir === 'down') pan.y = -panAmount;
            if (dir === 'left') pan.x = panAmount;
            if (dir === 'right') pan.x = -panAmount;
            this.graphManager.cy.panBy(pan);
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
