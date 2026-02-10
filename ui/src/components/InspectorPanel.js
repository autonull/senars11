import { Component } from './Component.js';

export class InspectorPanel extends Component {
    constructor(container) {
        super(container);
        this.currentData = null;
        this.onSave = null;
    }

    render() {
        if (!this.container) return;
        // Basic shell
        this.container.innerHTML = `
            <div id="inspector-panel" class="hud-panel inspector-panel hidden">
                <h3>Inspector</h3>
                <div id="inspector-content">
                    <div class="inspector-empty">Select a node to inspect</div>
                </div>
                <button id="btn-close-inspector" class="btn small-btn">Close</button>
            </div>
        `;

        // Bind close button
        const btnClose = this.container.querySelector('#btn-close-inspector');
        if (btnClose) {
            btnClose.onclick = () => this.hide();
        }
    }

    show() {
        const panel = this.container.querySelector('#inspector-panel');
        if (panel) panel.classList.remove('hidden');
    }

    hide() {
        const panel = this.container.querySelector('#inspector-panel');
        if (panel) panel.classList.add('hidden');
    }

    update(data, mode = 'visualization') {
        this.currentData = data;
        const content = this.container.querySelector('#inspector-content');
        if (!content) return;

        this.show();

        // Header (ID)
        let html = `
            <div class="prop-row">
                <span class="prop-label">ID</span>
                <span class="prop-value" title="${data.id}">${this._truncate(data.id)}</span>
            </div>
        `;

        const isControl = (mode === 'control');

        // Properties
        for (const [key, value] of Object.entries(data)) {
            if (key === 'weight' || key === 'id' || typeof value === 'object') continue;

            let displayVal = value;
            if (typeof value === 'number') displayVal = value.toFixed(3);

            if (isControl) {
                html += `
                    <div class="prop-row">
                        <span class="prop-label">${key}</span>
                        <input type="text" class="prop-input" data-key="${key}" value="${value}" />
                    </div>
                `;
            } else {
                html += `
                    <div class="prop-row">
                        <span class="prop-label">${key}</span>
                        <span class="prop-value">${displayVal}</span>
                    </div>
                `;
            }
        }

        if (isControl) {
            html += `
                <div style="margin-top: 10px; text-align: right;">
                    <button id="btn-inspector-save" class="btn small-btn">Save Changes</button>
                </div>
            `;
        }

        content.innerHTML = html;

        if (isControl) {
            const btnSave = content.querySelector('#btn-inspector-save');
            if (btnSave) {
                btnSave.onclick = () => this._handleSave();
            }
        }
    }

    _handleSave() {
        if (!this.onSave || !this.currentData) return;

        const inputs = this.container.querySelectorAll('.prop-input');
        const updates = {};

        inputs.forEach(input => {
            const key = input.dataset.key;
            let value = input.value;

            // Attempt numeric parse
            if (!isNaN(parseFloat(value)) && isFinite(value)) {
                value = parseFloat(value);
            }
            updates[key] = value;
        });

        this.onSave(this.currentData.id, updates);
    }

    _truncate(str, n = 20) {
        return (str.length > n) ? str.substr(0, n-1) + '...' : str;
    }
}
