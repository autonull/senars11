import { Component } from './Component.js';

export class InspectorPanel extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div id="inspector-panel" class="hud-panel inspector-panel hidden">
                <h3>Inspector</h3>
                <div id="inspector-content"></div>
                <button id="btn-close-inspector" class="btn small-btn">Close</button>
            </div>
        `;
    }
}
