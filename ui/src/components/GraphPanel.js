import { Component } from './Component.js';
import { SeNARSGraph } from '../zui/SeNARSGraph.js';
import { FluentToolbar } from './ui/FluentToolbar.js';
import { FluentUI } from '../utils/FluentUI.js';
import { ReactiveState } from '../core/ReactiveState.js';
import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';

export class GraphPanel extends Component {
    constructor(containerId, graphOptions = {}) {
        super(containerId);
        this.graphManager = null;
        this.initialized = false;
        this.graphOptions = graphOptions;

        const savedLayout = localStorage.getItem('senars-graph-layout') || 'fcose';

        this.state = new ReactiveState({
            filters: {
                showTasks: true,
                minPriority: 0,
                hideIsolated: false
            },
            viewMode: savedLayout,
            scatterAxes: { x: 'priority', y: 'confidence' }
        });

        // Watchers
        this.state.watch('filters', () => this._dispatchFilter());
        this.state.watch('viewMode', (mode) => this.setLayout(mode));
        this.state.watch('scatterAxes', () => {
            if (this.state.viewMode === 'scatter') {
                this.setLayout('scatter');
            }
        });

        this._setupEventListeners();
    }

    get filters() { return this.state.filters; }
    get viewMode() { return this.state.viewMode; }
    get scatterAxes() { return this.state.scatterAxes; }

    initialize() {
        if (this.initialized || !this.container) return;

        if (this.graphOptions.showToolbar !== false) {
            this.createToolbar();
        }
        this.createGraphContainer();

        try {
            this.graphManager = new SeNARSGraph(this.graphDiv);
            this.initialized = this.graphManager.initialize(this.graphOptions);
            if (this.initialized) {
                this.graphManager.setUpdatesEnabled(true);
            }
        } catch (e) {
            console.error('Failed to initialize SeNARSGraph:', e);
        }
    }

    _setupEventListeners() {
        eventBus.on(EVENTS.GRAPH_FILTER, (filters) => {
            this.state.filters = filters;
        });

        eventBus.on('visualization.settings', (settings) => {
            if (settings.viewMode && settings.viewMode !== this.state.viewMode) {
                this.state.viewMode = settings.viewMode;
            }
            if (settings.scatterAxes) {
                this.state.scatterAxes = settings.scatterAxes;
            }
        });
    }

    createToolbar() {
        const toolbarContainer = FluentUI.create('div')
            .class('graph-toolbar-container')
            .mount(this.container)
            .dom;

        new FluentToolbar(toolbarContainer, this._createToolbarItems()).render();
    }

    _createToolbarItems() {
        return [
            {
                type: 'group',
                class: 'graph-control-row',
                items: [
                    { type: 'button', icon: '⤢', title: 'Fit', onClick: () => this.graphManager?.fitToScreen() },
                    { type: 'button', icon: '➕', title: 'In', onClick: () => this.graphManager?.zoomIn() },
                    { type: 'button', icon: '➖', title: 'Out', onClick: () => this.graphManager?.zoomOut() },
                    { type: 'button', icon: '↻', title: 'Refresh', onClick: () => this.resize(), id: 'refresh-graph' }
                ]
            }
        ];
    }

    setLayout(layout) {
        if (layout === 'scatter') {
            this.graphManager?.applyScatterLayout(this.state.scatterAxes.x, this.state.scatterAxes.y);
        } else if (layout === 'sorted-grid') {
             this.graphManager?.applySortedGridLayout('priority');
        } else {
            this.graphManager?.setLayout(layout);
        }
    }

    createGraphContainer() {
        this.graphDiv = FluentUI.create('div')
            .class('graph-viewport')
            .style({ width: '100%', height: '100%' })
            .mount(this.container)
            .dom;
    }

    _dispatchFilter() {
        if (this.graphManager) {
            this.graphManager.applyFilters(this.filters);
        }
    }

    update(message) {
        this.initialized && this.graphManager?.updateFromMessage(message);
    }

    resize() {
        const cy = this.graphManager?.cy;
        if (cy) {
            cy.resize();
            cy.fit();
        }
    }

    reset() {
        this.graphManager?.clear();
    }
}
