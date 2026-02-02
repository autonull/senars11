import { Component } from './Component.js';

export class InfoPanel extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="hud-panel info-panel">
                <h1>SeNARS Explorer</h1>
                <p>Gardening Knowledge Interactively</p>
                <div id="system-metrics-container"></div>
                <div id="zoom-level">Level: overview</div>
                <div id="bag-stats">Bag: 0 / 50</div>
                <div class="mode-controls">
                    <button class="btn mode-btn active" data-mode="visualization">Visualization</button>
                    <button class="btn mode-btn" data-mode="representation">Representation</button>
                    <button class="btn mode-btn" data-mode="control">Control</button>
                </div>
            </div>
        `;
    }
}
