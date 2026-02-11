import { Component } from './Component.js';
import { GraphManager } from '../visualization/GraphManager.js';
import { FluentToolbar } from './ui/FluentToolbar.js';
import { FluentUI } from '../utils/FluentUI.js';
import { ReactiveState } from '../core/ReactiveState.js';
import { eventBus } from '../core/EventBus.js';

export class GraphPanel extends Component {
    constructor(containerId) {
        super(containerId);
        this.graphManager = null;
        this.initialized = false;

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

        this.axisSelectors = null;

        // Watchers
        this.state.watch('filters', () => this._dispatchFilter());
        this.state.watch('viewMode', (mode) => this.setLayout(mode));
        this.state.watch('scatterAxes', () => {
            if (this.state.viewMode === 'scatter') {
                this.setLayout('scatter');
            }
        });
    }

    get filters() { return this.state.filters; }
    get viewMode() { return this.state.viewMode; }
    get scatterAxes() { return this.state.scatterAxes; }

    initialize() {
        if (this.initialized || !this.container) return;

        this.createToolbar();
        this.createGraphContainer();

        try {
            this.graphManager = new GraphManager({
                graphContainer: this.graphDiv,
                graphDetails: null
            });
            this.initialized = this.graphManager.initialize();
            if (this.initialized) {
                this.graphManager.setUpdatesEnabled(true);
            }
        } catch (e) {
            console.error('Failed to initialize GraphManager:', e);
        }
    }

    createToolbar() {
        const toolbarContainer = document.createElement('div');
        toolbarContainer.className = 'graph-toolbar-container';
        this.container.appendChild(toolbarContainer);

        const config = this.getToolbarConfig();
        new FluentToolbar(toolbarContainer, config).render();
    }

    getToolbarConfig() {
        return [
            {
                type: 'group',
                class: 'graph-control-row',
                items: [
                    {
                        type: 'select',
                        class: 'graph-layout-select',
                        style: { background: '#333', color: '#eee', border: '1px solid #444', borderRadius: '3px', padding: '2px', marginRight: '4px' },
                        options: this._getLayoutOptions(),
                        onChange: (val) => this.state.viewMode = val
                    },
                    { type: 'custom', renderer: () => this.createAxisSelectors() },
                    { type: 'button', icon: '⤢', title: 'Fit', onClick: () => this.graphManager?.fitToScreen() },
                    { type: 'button', icon: '➕', title: 'In', onClick: () => this.graphManager?.zoomIn() },
                    { type: 'button', icon: '➖', title: 'Out', onClick: () => this.graphManager?.zoomOut() },
                    { type: 'button', icon: '↻', title: 'Refresh', onClick: () => this.resize(), id: 'refresh-graph' }
                ]
            },
            ...this._getFilterControls()
        ];
    }

    _getLayoutOptions() {
        return [
            { value: 'fcose', label: 'Force Graph', selected: true },
            { value: 'grid', label: 'Grid' },
            { value: 'circle', label: 'Circle' },
            { value: 'scatter', label: 'Scatter Plot' },
            { value: 'sorted-grid', label: 'Sorted Grid' }
        ];
    }

    _getFilterControls() {
        return [
            {
                type: 'toggle',
                label: 'Tasks',
                checked: true,
                inputStyle: { margin: '0' },
                style: { marginLeft: '8px' },
                onChange: (checked) => {
                    this.state.filters = { ...this.state.filters, showTasks: checked };
                }
            },
            {
                type: 'toggle',
                label: 'Isolated',
                checked: false,
                inputStyle: { margin: '0' },
                style: { marginLeft: '8px' },
                onChange: (checked) => {
                    this.state.filters = { ...this.state.filters, hideIsolated: checked };
                }
            },
            {
                type: 'slider',
                label: 'Prio>',
                min: 0,
                max: 1,
                step: 0.05,
                value: 0,
                class: 'graph-slider-container',
                onChange: (val) => {
                    this.state.filters = { ...this.state.filters, minPriority: val };
                }
            }
        ];
    }

    createAxisSelectors() {
        const axes = ['priority', 'confidence', 'frequency', 'durability', 'quality', 'taskCount'];
        const createSelector = (label, axis) => {
            return FluentUI.create('select')
                .class('toolbar-select-mini')
                .style({ background: '#222', color: '#ccc', border: '1px solid #333', margin: '0 2px', fontSize: '10px' })
                .on('change', (e) => {
                    this.state.scatterAxes = { ...this.state.scatterAxes, [axis]: e.target.value };
                })
                .children(axes.map(opt =>
                    FluentUI.create('option')
                        .attr({ value: opt })
                        .text(opt.charAt(0).toUpperCase() + opt.slice(1))
                        .prop({ selected: opt === this.state.scatterAxes[axis] })
                ));
        };

        const container = FluentUI.create('span')
            .style({ display: 'none', fontSize: '10px', color: '#888' })
            .text(' X: ')
            .child(createSelector('X', 'x'))
            .child(document.createTextNode(' Y: '))
            .child(createSelector('Y', 'y'));

        this.axisSelectors = container.dom;
        return this.axisSelectors;
    }

    setLayout(layout) {
        // Persist
        localStorage.setItem('senars-graph-layout', layout);

        // Toggle Axis Selectors
        if (this.axisSelectors) {
            this.axisSelectors.style.display = layout === 'scatter' ? 'inline' : 'none';
        }

        if (layout === 'scatter') {
            this.graphManager?.applyScatterLayout(this.state.scatterAxes.x, this.state.scatterAxes.y);
        } else if (layout === 'sorted-grid') {
             this.graphManager?.applySortedGridLayout('priority');
        } else {
            this.graphManager?.setLayout(layout);
        }
    }

    createGraphContainer() {
        this.graphDiv = document.createElement('div');
        this.graphDiv.className = 'graph-container';
        this.graphDiv.id = 'graph-container';
        this.container.appendChild(this.graphDiv);
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
