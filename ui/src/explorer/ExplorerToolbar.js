import { Component } from '../components/Component.js';

export class ExplorerToolbar extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div id="control-toolbar" class="hud-panel control-toolbar">
                <div class="toolbar-group">
                    <button id="btn-save" class="btn" title="Save Graph to JSON">Save</button>
                    <button id="btn-load" class="btn" title="Load Graph from JSON">Load</button>
                </div>
                <div class="divider"></div>
                <div class="toolbar-group">
                    <button id="btn-add-concept" class="btn" title="Add New Concept">Add Node</button>
                    <button id="btn-add-link" class="btn" title="Link Selected Nodes">Link</button>
                    <button id="btn-delete" class="btn warning-btn" title="Delete Selected">Delete</button>
                    <button id="btn-clear" class="btn warning-btn" title="Clear Workspace">Clear</button>
                </div>
            </div>

            <div class="hud-panel bottom-right-controls">
                <button id="btn-fit" class="btn" title="Fit View to Screen">Fit</button>
                <button id="btn-in" class="btn" title="Zoom In">+</button>
                <button id="btn-out" class="btn" title="Zoom Out">-</button>
                <button id="btn-layout" class="btn" title="Recalculate Layout">Layout</button>
            </div>
        `;
    }
}
