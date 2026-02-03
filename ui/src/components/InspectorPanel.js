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
        const fields = this._getEditableFields(data);

        fields.forEach(field => {
            const { key, value, type, path } = field;
            let displayVal = value;
            if (typeof value === 'number') displayVal = value.toFixed(3);

            if (isControl) {
                const inputType = type === 'number' ? 'number' : 'text';
                const step = type === 'number' ? '0.01' : '';
                html += `
                    <div class="prop-row">
                        <span class="prop-label">${key}</span>
                        <input type="${inputType}" class="prop-input" step="${step}" data-path="${path}" value="${value}" />
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
        });

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

    _getEditableFields(data, prefix = '') {
        let fields = [];

        // Priority fields (flat)
        const priorityKeys = ['term', 'label', 'type'];
        priorityKeys.forEach(k => {
            if (data[k] !== undefined) {
                fields.push({ key: k, value: data[k], type: typeof data[k], path: k });
            }
        });

        // Nested objects we care about
        if (data.budget) {
            ['priority', 'durability', 'quality'].forEach(k => {
                if (data.budget[k] !== undefined) {
                    fields.push({ key: `budget.${k}`, value: data.budget[k], type: 'number', path: `budget.${k}` });
                }
            });
        }

        if (data.truth) {
            ['frequency', 'confidence'].forEach(k => {
                 if (data.truth[k] !== undefined) {
                    fields.push({ key: `truth.${k}`, value: data.truth[k], type: 'number', path: `truth.${k}` });
                }
            });
        }

        // Handle other flat properties
        for (const [key, value] of Object.entries(data)) {
            if (['weight', 'id', 'budget', 'truth', 'fullData', 'tasks'].includes(key)) continue;
            if (priorityKeys.includes(key)) continue; // Already added
            if (typeof value === 'object') continue; // Skip generic objects

            fields.push({ key, value, type: typeof value, path: key });
        }

        return fields;
    }

    _handleSave() {
        if (!this.onSave || !this.currentData) return;

        const inputs = this.container.querySelectorAll('.prop-input');
        const updates = {};

        inputs.forEach(input => {
            const path = input.dataset.path;
            let value = input.value;

            // Numeric handling
            if (input.type === 'number') {
                value = parseFloat(value);
            }

            // Reconstruct nested object structure
            this._setDeep(updates, path, value);
        });

        // For deep updates, we need to merge with current data structure
        // But ExplorerApp.js saveNodeChanges does a shallow merge usually.
        // We might need to handle the merge here or in ExplorerApp.
        // Let's assume updates is enough for now, but we need to ensure budget/truth are objects

        this.onSave(this.currentData.id, updates);
    }

    _setDeep(obj, path, value) {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }

    _truncate(str, n = 20) {
        return (str.length > n) ? str.substr(0, n-1) + '...' : str;
    }
}
