import { Component } from '../components/Component.js';

export class ExplorerInfoPanel extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="hud-panel info-panel">
                <div class="hud-row">
                    <span id="zoom-level">ZOOM: 1.0x</span>
                    <span id="bag-stats">MEM: 0/50</span>
                </div>
                <div class="mode-controls">
                    <button class="btn mode-btn active" data-mode="visualization">VIS</button>
                    <button class="btn mode-btn" data-mode="representation">REP</button>
                    <button class="btn mode-btn" data-mode="control">CTL</button>
                </div>
                <h3>LAYERS</h3>
                <div class="layer-controls">
                    <label class="layer-toggle">
                        <input type="checkbox" checked data-layer="concepts">
                        <span class="layer-label">Concepts 🧠</span>
                    </label>
                    <label class="layer-toggle">
                        <input type="checkbox" checked data-layer="tasks">
                        <span class="layer-label">Tasks ⚡</span>
                    </label>
                     <label class="layer-toggle">
                        <input type="checkbox" data-layer="trace">
                        <span class="layer-label">Reasoning 🔗</span>
                    </label>
                    <label class="layer-toggle">
                        <input type="checkbox" id="check-isolated">
                        <span class="layer-label">Hide Isolated</span>
                    </label>
                </div>

                <h3>Layout & Filters</h3>
                <div class="control-group">
                    <select id="layout-select" class="control-select small-btn">
                        <option value="fcose">Layout: Force</option>
                        <option value="grid">Layout: Grid</option>
                        <option value="circle">Layout: Circle</option>
                        <option value="scatter">Layout: Scatter</option>
                        <option value="sorted-grid">Layout: Sorted</option>
                    </select>
                </div>
                <div class="control-group" style="margin-top: 5px; padding: 0 5px;">
                     <div class="hud-subtitle" style="margin-bottom: 2px;">Min Priority: <span id="prio-val">0.0</span></div>
                     <input type="range" id="filter-priority" min="0" max="1" step="0.05" value="0" style="width: 100%">
                </div>

                <h3>Visual Mappings</h3>
                <div class="control-group">
                    <select id="mapping-size" class="control-select small-btn">
                        <option value="priority">Size: Priority</option>
                        <option value="complexity">Size: Complexity</option>
                        <option value="fixed">Size: Fixed</option>
                    </select>
                </div>
                <div class="control-group">
                    <select id="mapping-color" class="control-select small-btn">
                        <option value="hash">Color: Hash</option>
                        <option value="type">Color: Type</option>
                        <option value="priority">Color: Priority</option>
                    </select>
                </div>
                </div>
            </div>
        `;
    }
}
