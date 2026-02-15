import {Component} from './Component.js';
import {GraphManager} from '../visualization/GraphManager.js';
import {contextMenu} from './GlobalContextMenu.js';
import {Toolbar} from './ui/Toolbar.js';

export class GraphPanel extends Component {
    constructor(containerId) {
        super(containerId);
        this.graphManager = null;
        this.initialized = false;
        this.filters = {
            showTasks: true,
            minPriority: 0
        };
    }

    initialize() {
        if (this.initialized || !this.container) return;

        // Create Toolbar
        const toolbarContainer = document.createElement('div');
        toolbarContainer.style.cssText = `
            position: absolute; top: 10px; left: 10px; z-index: 10;
            background: rgba(0,0,0,0.8); padding: 4px; border-radius: 4px;
            border: 1px solid var(--border-color); backdrop-filter: blur(2px);
        `;

        const tb = new Toolbar(toolbarContainer, { style: 'display: flex; flex-direction: column; gap: 6px;' });

        // Row 1: Controls
        const controlRow = document.createElement('div');
        controlRow.style.display = 'flex';
        controlRow.style.gap = '4px';
        const controlTb = new Toolbar(controlRow, { style: 'display: flex; gap: 4px;' });

        controlTb.addButton({ icon: '⤢', title: 'Fit View', onClick: () => this.graphManager?.fitToScreen(), className: 'toolbar-btn' });
        controlTb.addButton({ icon: '🔭', title: 'Focus Center', onClick: () => this.graphManager?.cy?.center(), className: 'toolbar-btn' });
        controlTb.addButton({ icon: '➕', title: 'Zoom In', onClick: () => this.graphManager?.zoomIn(), className: 'toolbar-btn' });
        controlTb.addButton({ icon: '➖', title: 'Zoom Out', onClick: () => this.graphManager?.zoomOut(), className: 'toolbar-btn' });

        tb.addCustom(controlRow);

        // Filter: Show Tasks
        const taskToggle = document.createElement('label');
        taskToggle.style.cssText = 'font-size: 10px; color: #ccc; display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; padding: 0 4px;';
        taskToggle.innerHTML = `<input type="checkbox" checked style="margin:0;"> Show Tasks`;
        taskToggle.querySelector('input').onchange = (e) => {
            this.filters.showTasks = e.target.checked;
            this._dispatchFilter();
        };
        tb.addCustom(taskToggle);

        // Filter: Priority Slider
        const sliderContainer = document.createElement('div');
        sliderContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; padding: 0 4px;';
        const sliderLabel = document.createElement('div');
        sliderLabel.style.cssText = 'font-size: 9px; color: #aaa; display: flex; justify-content: space-between;';
        sliderLabel.innerHTML = '<span>Min Prio</span><span id="gp-prio-val">0.0</span>';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.05';
        slider.value = '0';
        slider.style.width = '100%';
        slider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            this.filters.minPriority = val;
            sliderLabel.querySelector('#gp-prio-val').textContent = val.toFixed(2);
            this._dispatchFilter();
        };

        sliderContainer.append(sliderLabel, slider);
        tb.addCustom(sliderContainer);

        this.container.appendChild(toolbarContainer);

        // Graph Container
        const graphDiv = document.createElement('div');
        graphDiv.style.cssText = 'width: 100%; height: 100%;';
        this.container.appendChild(graphDiv);

        const uiElements = {
            graphContainer: graphDiv,
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
                        { label: 'Highlight', icon: '🔦', action: () => this.graphManager.toggleTraceMode(node.id()) },
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

    _dispatchFilter() {
        document.dispatchEvent(new CustomEvent('senars:graph:filter', {
            detail: { ...this.filters }
        }));
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
