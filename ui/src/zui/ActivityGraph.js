import { GraphViewport } from './GraphViewport.js';
import { SemanticZoom } from './SemanticZoom.js';
import { ContextualWidget } from './ContextualWidget.js';

export class ActivityGraph {
    constructor(container, widgetContainer) {
        this.viewport = new GraphViewport(container);
        this.semanticZoom = new SemanticZoom(this.viewport);
        // If widgetContainer is not provided, use the graph container (or its parent if needed)
        // Ideally widgets should be on top of the canvas.
        this.widgetManager = new ContextualWidget(this.viewport, widgetContainer || container);
    }

    async initialize() {
        if (this.viewport.initialize()) {
            this._setupDemoData(); // Keep demo data for now or remove? keeping as fallback
            return true;
        }
        return false;
    }

    handleMessage(message) {
        switch (message.type) {
            case 'concept.created':
            case 'reasoning:concept':
                this._handleConceptCreated(message.payload);
                break;
            case 'control/snapshot':
            case 'memorySnapshot':
                this._handleSnapshot(message.payload);
                break;
            case 'link.created':
                this._handleLinkCreated(message.payload);
                break;
        }
    }

    _handleConceptCreated(payload) {
        const term = payload.term || payload.name || payload.id;
        if (!term) return;

        const priority = payload.priority || 0.5;
        this.addConcept(term, priority, payload);
    }

    _handleLinkCreated(payload) {
        const { source, target, type } = payload;
        if (source && target) {
            this.addRelationship(source, target, type || 'related');
        }
    }

    _handleSnapshot(payload) {
        // Assuming payload is { concepts: [], links: [] } or similar
        const concepts = payload.concepts || payload.nodes || [];
        const links = payload.links || payload.edges || [];

        this.viewport.clear();

        concepts.forEach(c => {
             this._handleConceptCreated(c);
        });

        links.forEach(l => {
             this._handleLinkCreated(l);
        });

        this.viewport.fit();
    }

    addConcept(term, priority, details = {}) {
        this.viewport.addElements({
            group: 'nodes',
            data: {
                id: term,
                label: term,
                weight: (priority * 20) + 20,
                ...details
            }
        });

        // Add widget
        const widgetHtml = `
            <div>Prio: ${typeof priority === 'number' ? priority.toFixed(2) : priority}</div>
            ${details.frequency ? `<div>Freq: ${details.frequency.toFixed(2)}</div>` : ''}
        `;
        this.widgetManager.attach(term, widgetHtml);
    }

    addRelationship(source, target, type) {
        this.viewport.addElements({
            group: 'edges',
            data: {
                source: source,
                target: target,
                label: type
            }
        });
    }

    _setupDemoData() {
        // Create a cluster of concepts
        const concepts = [
            { term: 'bird', priority: 0.9, frequency: 0.8 },
            { term: 'robin', priority: 0.8, frequency: 0.7 },
            { term: 'animal', priority: 0.95, frequency: 0.9 },
            { term: 'wings', priority: 0.7, frequency: 0.6 },
            { term: 'fly', priority: 0.85, frequency: 0.75 }
        ];

        concepts.forEach(c => this.addConcept(c.term, c.priority, { frequency: c.frequency }));

        this.addRelationship('robin', 'bird', 'inheritance');
        this.addRelationship('bird', 'animal', 'inheritance');
        this.addRelationship('bird', 'wings', 'property');
        this.addRelationship('bird', 'fly', 'property');

        this.viewport.fit();
    }

    fit() {
        this.viewport.fit();
    }

    zoomIn() {
        if (!this.viewport.cy) return;
        this.viewport.cy.animate({ zoom: this.viewport.cy.zoom() * 1.2, duration: 200 });
    }

    zoomOut() {
        if (!this.viewport.cy) return;
        this.viewport.cy.animate({ zoom: this.viewport.cy.zoom() / 1.2, duration: 200 });
    }

    relayout() {
        if (!this.viewport.cy) return;
        this.viewport.cy.layout({
            name: 'grid',
            padding: 50,
            avoidOverlap: true,
            spacingFactor: 1.5,
            animate: true
        }).run();
    }
}
