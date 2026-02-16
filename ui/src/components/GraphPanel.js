import {Component} from './Component.js';
import {GraphManager} from '../visualization/GraphManager.js';
import {contextMenu} from './GlobalContextMenu.js';

export class GraphPanel extends Component {
    constructor(containerId) {
        super(containerId);
        this.graphManager = null;
        this.initialized = false;
    }

    initialize() {
        if (this.initialized || !this.container) return;

        const uiElements = {
            graphContainer: this.container,
            graphDetails: null
        };

        try {
            this.graphManager = new GraphManager(uiElements);
            this.initialized = this.graphManager.initialize();

            // Integrate GlobalContextMenu
            if (this.initialized && this.graphManager.cy) {
                this.graphManager.cy.on('cxttap', 'node', (evt) => {
                    const node = evt.target;
                    const items = [
                        { label: 'Inspect', icon: '🔍', action: () => this._inspectNode(node) },
                        { label: 'Focus', icon: '🎯', action: () => this.graphManager.focusNode(node.id()) },
                        { label: 'Expand', icon: '🔗', action: () => this.graphManager.expandNode(node.id()) },
                        { separator: true },
                        { label: 'Copy ID', icon: '📋', action: () => navigator.clipboard.writeText(node.id()) }
                    ];
                    contextMenu.show(evt.originalEvent.clientX, evt.originalEvent.clientY, items);
                });
            }
        } catch (e) {
            console.error('Failed to initialize GraphManager:', e);
        }
    }

    _inspectNode(node) {
        console.log('Inspecting node:', node.data());
        document.dispatchEvent(new CustomEvent('senars:concept:select', {
            detail: { concept: { term: node.id(), ...node.data() } }
        }));
    }

    update(message) {
        this.graphManager?.initialized && this.graphManager.updateFromMessage(message);
    }

    reset() {
        this.graphManager?.initialized && this.graphManager.clear();
    }
}
