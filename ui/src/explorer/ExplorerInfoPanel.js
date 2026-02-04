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
                        <span class="layer-label">CONCEPTS 🧠</span>
                    </label>
                    <label class="layer-toggle">
                        <input type="checkbox" checked data-layer="tasks">
                        <span class="layer-label">TASKS ⚡</span>
                    </label>
                     <label class="layer-toggle">
                        <input type="checkbox" data-layer="trace">
                        <span class="layer-label">REASONING 🔗</span>
                    </label>
                </div>
                <h3>VISUAL MAPPINGS</h3>
                <div class="control-group">
                    <select id="mapping-size" class="control-select small-btn">
                        <option value="priority">SIZE: PRIORITY</option>
                        <option value="complexity">SIZE: COMPLEXITY</option>
                        <option value="fixed">SIZE: FIXED</option>
                    </select>
                </div>
                <div class="control-group">
                    <select id="mapping-color" class="control-select small-btn">
                        <option value="hash">COLOR: HASH</option>
                        <option value="type">COLOR: TYPE</option>
                        <option value="priority">COLOR: PRIORITY</option>
                    </select>
                </div>
                </div>
            </div>
        `;
    }
}
