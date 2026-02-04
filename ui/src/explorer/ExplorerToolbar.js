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
                <div class="file-controls">
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
