import { ActivityGraph } from '../zui/ActivityGraph.js';

export class ZUIPanel {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.graph = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        this.container.classList.add('zui-panel');

        // Create container for the graph
        this.graphContainer = document.createElement('div');
        this.graphContainer.id = 'zui-graph-container';
        this.graphContainer.style.width = '100%';
        this.graphContainer.style.height = '100%';
        this.graphContainer.style.position = 'relative';
        this.graphContainer.style.overflow = 'hidden';
        this.container.appendChild(this.graphContainer);

        // Initialize ActivityGraph
        this.graph = new ActivityGraph(this.graphContainer);
        await this.graph.initialize();

        this.resize();
        this.initialized = true;
    }

    resize() {
        if (this.graph && this.graph.cy) {
            this.graph.cy.resize();
            this.graph.cy.fit();
        }
    }

    // API methods that might be called by the IDE
    onMessage(message) {
        if (this.graph) {
            this.graph.handleMessage(message);
        }
    }
}
