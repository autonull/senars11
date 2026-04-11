import { ActivityGraph } from '../zui/ActivityGraph.js';

export class ZUIPanel {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.graph = null;
        this.initialized = false;
        this.resizeObserver = null;
    }

    async initialize() {
        if (this.initialized) {return;}

        this.container.classList.add('zui-panel');

        // Create container for the graph
        this.graphContainer = document.createElement('div');
        this.graphContainer.id = 'zui-graph-container';
        this.graphContainer.style.width = '100%';
        this.graphContainer.style.height = '100%';
        this.graphContainer.style.position = 'relative';
        this.graphContainer.style.overflow = 'hidden';
        this.container.appendChild(this.graphContainer);

        this.graph = new ActivityGraph(this.graphContainer);

        // Setup ResizeObserver to handle initialization and resizing
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    if (!this.initialized) {
                        this._initGraph();
                    } else {
                        this.resize();
                    }
                }
            }
        });

        // Observe the container (or graphContainer)
        this.resizeObserver.observe(this.graphContainer);
    }

    async _initGraph() {
        if (this.initialized) {return;}

        console.log('ZUIPanel: Initializing graph with dimensions', this.graphContainer.clientWidth, this.graphContainer.clientHeight);

        const success = await this.graph.initialize();
        if (success) {
            this.initialized = true;
            this.resize(); // Ensure fit
        } else {
            console.error('ZUIPanel: Failed to initialize graph');
        }
    }

    resize() {
        if (this.initialized && this.graph && this.graph.viewport && this.graph.viewport.cy) {
            this.graph.viewport.cy.resize();
            // Debounce fit to avoid jumpiness during resize?
            // For now just resize. fit() might be annoying if user panned.
        }
    }

    // API methods that might be called by the IDE
    onMessage(message) {
        if (this.graph) {
            this.graph.handleMessage(message);
        }
    }

    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        // cleanup graph...
    }
}
