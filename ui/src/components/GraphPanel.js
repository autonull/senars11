import { Component } from './Component.js';
import { GraphManager } from '../visualization/GraphManager.js';
import { Toolbar } from './ui/Toolbar.js';

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

        const tb = new Toolbar(toolbarContainer);

        // Row 1: Layout & Controls
        const controlRow = document.createElement('div');
        controlRow.className = 'graph-control-row';
        const controlTb = new Toolbar(controlRow);

        // View Mode Selector
        const layoutSelect = document.createElement('select');
        layoutSelect.className = 'graph-layout-select toolbar-select';
        layoutSelect.style.cssText = 'background: #333; color: #eee; border: 1px solid #444; border-radius: 3px; padding: 2px; margin-right: 4px;';

        const layouts = [
            {v: 'fcose', l: 'Force Graph'},
            {v: 'grid', l: 'Grid'},
            {v: 'circle', l: 'Circle'},
            {v: 'scatter', l: 'Scatter Plot'},
            {v: 'sorted-grid', l: 'Sorted Grid'}
        ];

        layouts.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.v;
            opt.textContent = l.l;
            layoutSelect.appendChild(opt);
        });

        layoutSelect.onchange = (e) => this.setLayout(e.target.value);
        controlTb.addCustom(layoutSelect);

        // Axis Selectors (Initially Hidden)
        this.axisSelectors = document.createElement('span');
        this.axisSelectors.style.display = 'none';
        this.axisSelectors.style.fontSize = '10px';
        this.axisSelectors.style.color = '#888';

        const createAxisSel = (label, axis) => {
            const sel = document.createElement('select');
            sel.className = 'toolbar-select-mini';
            sel.style.cssText = 'background: #222; color: #ccc; border: 1px solid #333; margin: 0 2px; font-size: 10px;';
            ['priority', 'confidence', 'frequency', 'durability', 'quality', 'taskCount'].forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
                if (opt === this.scatterAxes[axis]) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = (e) => {
                this.scatterAxes[axis] = e.target.value;
                this.setLayout('scatter');
            };
            return sel;
        };

        this.axisSelectors.innerHTML = ' X: ';
        this.axisSelectors.appendChild(createAxisSel('X', 'x'));
        this.axisSelectors.innerHTML += ' Y: ';
        this.axisSelectors.appendChild(createAxisSel('Y', 'y'));

        controlTb.addCustom(this.axisSelectors);

        controlTb.addButton({ icon: '⤢', title: 'Fit', onClick: () => this.graphManager?.fitToScreen(), className: 'toolbar-btn' });
        controlTb.addButton({ icon: '➕', title: 'In', onClick: () => this.graphManager?.zoomIn(), className: 'toolbar-btn' });
        controlTb.addButton({ icon: '➖', title: 'Out', onClick: () => this.graphManager?.zoomOut(), className: 'toolbar-btn' });

        tb.addCustom(controlRow);

        // Filter: Show Tasks
        const taskToggle = document.createElement('label');
        taskToggle.className = 'graph-filter-toggle';
        taskToggle.innerHTML = `<input type="checkbox" checked style="margin:0;"> Tasks`;
        taskToggle.querySelector('input').onchange = (e) => {
            this.filters.showTasks = e.target.checked;
            this._dispatchFilter();
        };
        tb.addCustom(taskToggle);

        // Filter: Hide Isolated
        const isolatedToggle = document.createElement('label');
        isolatedToggle.className = 'graph-filter-toggle';
        isolatedToggle.style.marginLeft = '8px';
        isolatedToggle.innerHTML = `<input type="checkbox" style="margin:0;"> Isolated`;
        isolatedToggle.querySelector('input').onchange = (e) => {
            this.filters.hideIsolated = e.target.checked;
            this._dispatchFilter();
        };
        tb.addCustom(isolatedToggle);

        // Filter: Priority Slider
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'graph-slider-container';

        const sliderLabel = document.createElement('div');
        sliderLabel.className = 'graph-slider-label';
        sliderLabel.innerHTML = '<span>Prio></span><span id="gp-prio-val">0.0</span>';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.05';
        slider.value = '0';
        slider.className = 'graph-slider-input';
        slider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            this.filters.minPriority = val;
            sliderLabel.querySelector('#gp-prio-val').textContent = val.toFixed(2);
            this._dispatchFilter();
        };

        sliderContainer.append(sliderLabel, slider);
        tb.addCustom(sliderContainer);

        this.container.appendChild(toolbarContainer);
    }

    setLayout(layout) {
        this.viewMode = layout;

        // Toggle Axis Selectors
        this.axisSelectors.style.display = layout === 'scatter' ? 'inline' : 'none';

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
