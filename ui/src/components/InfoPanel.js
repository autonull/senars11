import { Component } from './Component.js';

export class InfoPanel extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="hud-panel info-panel">
                <div class="hud-header">
                    <span class="hud-title">SeNARS Explorer</span>
                    <span class="hud-subtitle">VER 1.0</span>
                </div>
                <div id="system-metrics-container"></div>
                <div class="hud-row">
                    <span id="zoom-level">ZOOM: 1.0x</span>
                    <span id="bag-stats">MEM: 0/50</span>
                </div>
                <div class="mode-controls">
                    <button class="btn mode-btn active" data-mode="visualization">VIS</button>
                    <button class="btn mode-btn" data-mode="representation">REP</button>
                    <button class="btn mode-btn" data-mode="control">CTL</button>
                </div>
            </div>
        `;
    }
}
