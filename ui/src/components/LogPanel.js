import { Component } from './Component.js';

export class LogPanel extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;
        // Set container ID for docking system
        this.container.id = 'log-widget';
        this.container.className = 'hud-widget dock-right';

        this.container.innerHTML = `
            <div class="hud-panel log-panel-container">
                <div class="log-header">
                    <span class="hud-title">ACTIVITY LOG</span>
                    <div id="llm-status" class="status-indicator">Offline</div>
                </div>
                <div id="log-panel" class="log-area">
                    <div id="log-content"></div>
                </div>
            </div>
        `;
    }
}
