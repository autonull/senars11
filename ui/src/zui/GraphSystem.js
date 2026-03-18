import cytoscape from 'cytoscape';

/**
 * GraphSystem
 * A generic wrapper around Cytoscape.js providing:
 * - Initialization and Resize handling
 * - Event management (simple pub/sub)
 * - Basic Viewport controls (zoom, pan, fit)
 * - Extensible styling and layout defaults
 */
export class GraphSystem {
    constructor(container) {
        this.container = container;
        this.cy = null;
        this.listeners = {};
        this.resizeObserver = null;
        this.initialized = false;
    }

    /**
     * Initialize the graph system
     * @param {Object} options Configuration options
     * @returns {boolean} Success status
     */
    initialize(options = {}) {
        if (this.initialized) return true;

        const container = typeof this.container === 'string'
            ? document.getElementById(this.container)
            : this.container;

        if (!container) {
            console.error(`GraphSystem: Container not found`, this.container);
            return false;
        }

        // Use global cytoscape if available (with extensions), otherwise local
        const cyFactory = window.cytoscape || cytoscape;

        try {
            const defaults = {
                container: container,
                style: options.style || this.getDefaultStyle(),
                layout: options.layout || { name: 'grid' },
                minZoom: 0.1,
                maxZoom: 10,
                wheelSensitivity: 0.2,
                boxSelectionEnabled: false
            };

            this.cy = cyFactory({ ...defaults, ...options.cytoscapeOptions });

            this._setupEvents();
            this._setupResizeObserver(container);
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('GraphSystem: Failed to initialize Cytoscape', error);
            return false;
        }
    }

    /**
     * Subscribe to an event
     * @param {string} event Event name
     * @param {Function} callback Callback function
     */
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event Event name
     * @param {Function} callback Callback function
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit an event
     * @param {string} event Event name
     * @param {*} data Event data
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    _setupEvents() {
        if (!this.cy) return;

        // Viewport events
        this.cy.on('zoom pan', () => {
            this.emit('viewport', {
                zoom: this.cy.zoom(),
                pan: this.cy.pan(),
                extent: this.cy.extent()
            });
        });

        this.cy.on('resize', () => {
             this.emit('resize', {
                 width: this.cy.width(),
                 height: this.cy.height()
             });
        });

        // Interaction events
        this.cy.on('tap', 'node', (evt) => {
            this.emit('nodeClick', { node: evt.target, originalEvent: evt });
        });

        this.cy.on('dbltap', 'node', (evt) => {
            this.emit('nodeDoubleClick', { node: evt.target, originalEvent: evt });
        });

        this.cy.on('tap', 'edge', (evt) => {
            this.emit('edgeClick', { edge: evt.target, originalEvent: evt });
        });

        this.cy.on('cxttap', (evt) => {
            this.emit('contextMenu', { target: evt.target, originalEvent: evt });
        });

        this.cy.on('tap', (evt) => {
            if (evt.target === this.cy) {
                this.emit('backgroundClick', { originalEvent: evt });
            }
        });

        this.cy.on('dbltap', (evt) => {
            if (evt.target === this.cy) {
                this.emit('backgroundDoubleClick', {
                    position: evt.position,
                    originalEvent: evt
                });
            }
        });
    }

    _setupResizeObserver(container) {
        this.resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    this.resize();
                }
            }
        });
        this.resizeObserver.observe(container);
    }

    getDefaultStyle() {
        return []; // Override in subclass
    }

    // --- Graph Manipulation ---

    addElements(elements) {
        return this.cy?.add(elements);
    }

    removeElements(collection) {
        this.cy?.remove(collection);
    }

    getElementById(id) {
        return this.cy?.getElementById(id);
    }

    clear() {
        this.cy?.elements().remove();
    }

    // --- Viewport Control ---

    fit(eles, padding = 50) {
        if (!this.cy) return;
        if (eles) {
            this.cy.animate({ fit: { eles: eles, padding: padding }, duration: 300 });
        } else {
            this.cy.animate({ fit: { eles: this.cy.elements(), padding: padding }, duration: 300 });
        }
    }

    zoomIn(amount = 1.2) {
        if (!this.cy) return;
        this.cy.animate({ zoom: this.cy.zoom() * amount, duration: 200 });
    }

    zoomOut(amount = 1.2) {
        if (!this.cy) return;
        this.cy.animate({ zoom: this.cy.zoom() / amount, duration: 200 });
    }

    resize() {
        this.cy?.resize();
    }

    layout(options) {
        this.cy?.layout(options).run();
    }

    batch(callback) {
        this.cy?.batch(callback);
    }

    destroy() {
        this.resizeObserver?.disconnect();
        this.cy?.destroy();
        this.listeners = {};
        this.initialized = false;
    }
}
