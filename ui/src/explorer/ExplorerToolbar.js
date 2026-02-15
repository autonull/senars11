import { Component } from '../components/Component.js';

export class ExplorerToolbar extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;
        // Set container ID for docking system - these are the old controls
        // We'll make them a compact corner widget
        this.container.id = 'controls-widget';
        this.container.className = 'hud-widget';

        this.container.innerHTML = `
            <div id="control-toolbar" class="hud-panel control-toolbar">
                <div class="reasoner-controls">
                    <button id="btn-run" class="btn" title="Run Reasoner">▶</button>
                    <button id="btn-pause" class="btn hidden" title="Pause Reasoner">⏸</button>
                    <button id="btn-step" class="btn" title="Step Reasoner">⏯</button>
                    <div class="throttle-control">
                        <span class="control-label">Delay:</span>
                        <input type="range" id="throttle-slider" min="0" max="1000" value="100" step="50">
                        <span id="throttle-val">100ms</span>
                    </div>
                    <button id="btn-save" class="btn">Save JSON</button>
                    <button id="btn-load" class="btn">Load JSON</button>
                </div>
                <div class="divider"></div>
                <button id="btn-add-concept" class="btn">Add Concept</button>
                <button id="btn-add-link" class="btn">Link Selected</button>
                <button id="btn-delete" class="btn warning-btn">Delete</button>
            </div>

            <div class="hud-panel bottom-right-controls">
                <button id="btn-fit" class="btn">Fit View</button>
                <button id="btn-in" class="btn">+</button>
                <button id="btn-out" class="btn">-</button>
                <button id="btn-layout" class="btn">Relayout</button>
            </div>
        `;
    }
}
