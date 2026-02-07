import { Component } from '../components/Component.js';

export class ExplorerInfoPanel extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;

        const maxNodes = 50;
        const zoom = '1.0x';

        this.container.innerHTML = `
            <div class="hud-panel info-panel">
                <div class="hud-row">
                    <span id="zoom-level">ZOOM: ${zoom}</span>
                    <span id="bag-stats">NODES: 0/${maxNodes}</span>
                </div>
                <div class="mode-controls" style="display: flex; gap: 2px; margin-bottom: 12px;">
                    ${this._renderModeBtn('visualization', 'VISUAL', true)}
                    ${this._renderModeBtn('representation', 'DATA')}
                    ${this._renderModeBtn('control', 'EDIT')}
                </div>

                <details open>
                    <summary style="font-size: 0.85rem; padding: 4px 0;">LAYERS</summary>
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
                </details>

                <details>
                    <summary style="font-size: 0.85rem; padding: 4px 0;">VIEW SETTINGS</summary>
                    <div class="control-group" style="margin-bottom: 8px;">
                        <select id="layout-select" class="control-select small-btn" style="width: 100%; margin-bottom: 4px;">
                            <option value="fcose" selected>Organic (Force)</option>
                            <option value="grid">Grid</option>
                            <option value="circle">Circle</option>
                            <option value="scatter">Scatter Plot</option>
                            <option value="sorted-grid">Sorted Grid</option>
                        </select>
                    </div>
                    <div class="control-group" style="padding: 0 2px;">
                        <div class="hud-subtitle" style="margin-bottom: 4px; display: flex; justify-content: space-between;">
                            <span>Min Priority</span>
                            <span id="prio-val" style="color: #fff;">0.0</span>
                        </div>
                        <input type="range" id="filter-priority" min="0" max="1" step="0.05" value="0" style="width: 100%; cursor: pointer;">
                    </div>
                </details>

                <details>
                    <summary style="font-size: 0.85rem; padding: 4px 0;">VISUAL MAPPINGS</summary>
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
                </details>
            </div>
        `;
    }

    _renderModeBtn(mode, label, active = false) {
        const cls = active ? 'active' : '';
        return `<button class="btn mode-btn ${cls}" data-mode="${mode}" title="${label} Mode" style="flex: 1;">${label}</button>`;
    }

    updateStats({ activeNodes = 0, maxNodes = 50 } = {}) {
        const el = this.container?.querySelector('#bag-stats');
        if (el) el.textContent = `NODES: ${activeNodes}/${maxNodes}`;
    }
}
