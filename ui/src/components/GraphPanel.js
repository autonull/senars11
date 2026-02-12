import { Component } from './Component.js';
import { GraphManager } from '../visualization/GraphManager.js';
import { FluentToolbar } from './ui/FluentToolbar.js';
import { FluentUI } from '../utils/FluentUI.js';

export class GraphPanel extends Component {
    constructor(containerId) {
        super(containerId);
        this.graphManager = null;
        this.initialized = false;
        this.filters = {
            showTasks: true,
            minPriority: 0,
            hideIsolated: false
        };
        this.viewMode = 'fcose'; // 'fcose', 'grid', 'scatter', etc.
        this.scatterAxes = { x: 'priority', y: 'confidence' };
        this.axisSelectors = null; // Reference to update visibility
    }

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
                        options: [
                            { value: 'fcose', label: 'Force Graph', selected: true },
                            { value: 'grid', label: 'Grid' },
                            { value: 'circle', label: 'Circle' },
                            { value: 'scatter', label: 'Scatter Plot' },
                            { value: 'sorted-grid', label: 'Sorted Grid' }
                        ],
                        onChange: (val) => this.setLayout(val)
                    },
                    {
                        type: 'custom',
                        renderer: () => this.createAxisSelectors()
                    },
                    { type: 'button', icon: '⤢', title: 'Fit', onClick: () => this.graphManager?.fitToScreen() },
                    { type: 'button', icon: '➕', title: 'In', onClick: () => this.graphManager?.zoomIn() },
                    { type: 'button', icon: '➖', title: 'Out', onClick: () => this.graphManager?.zoomOut() }
                ]
            },
            {
                type: 'toggle',
                label: 'Tasks',
                checked: true,
                inputStyle: { margin: '0' },
                style: { marginLeft: '8px' },
                onChange: (checked) => {
                    this.filters.showTasks = checked;
                    this._dispatchFilter();
                }
            },
            {
                type: 'toggle',
                label: 'Isolated',
                checked: false,
                inputStyle: { margin: '0' },
                style: { marginLeft: '8px' },
                onChange: (checked) => {
                    this.filters.hideIsolated = checked;
                    this._dispatchFilter();
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
                    this.filters.minPriority = val;
                    this._dispatchFilter();
                }
            }
        ];
    }

    createAxisSelectors() {
        // We still use imperative creation for this complex custom widget for now,
        // or we could wrap it in FluentUI, but let's stick to the refactor plan.
        // Actually, let's use FluentUI here too since we have it.

        const axes = ['priority', 'confidence', 'frequency', 'durability', 'quality', 'taskCount'];
        const createSelector = (label, axis) => {
            return FluentUI.create('select')
                .class('toolbar-select-mini')
                .style({ background: '#222', color: '#ccc', border: '1px solid #333', margin: '0 2px', fontSize: '10px' })
                .on('change', (e) => {
                    this.scatterAxes[axis] = e.target.value;
                    this.setLayout('scatter');
                })
                .children(axes.map(opt =>
                    FluentUI.create('option')
                        .attr({ value: opt })
                        .text(opt.charAt(0).toUpperCase() + opt.slice(1))
                        .prop({ selected: opt === this.scatterAxes[axis] })
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
        this.viewMode = layout;

        // Toggle Axis Selectors
        if (this.axisSelectors) {
            this.axisSelectors.style.display = layout === 'scatter' ? 'inline' : 'none';
        }

        if (layout === 'scatter') {
            this.graphManager?.applyScatterLayout(this.scatterAxes.x, this.scatterAxes.y);
        } else if (layout === 'sorted-grid') {
             this.graphManager?.applySortedGridLayout('priority');
        } else {
            this.graphManager?.setLayout(layout);
        }
    }

    createGraphContainer() {
        this.graphDiv = document.createElement('div');
        this.graphDiv.className = 'graph-container';
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
