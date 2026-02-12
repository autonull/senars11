import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class InspectorPanel extends Component {
    constructor(container) {
        super(container);
        this.currentData = null;
        this.onSave = null;
        this.onQuery = null;
        this.onTrace = null;
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

        // Derivation Trace (If available)
        if (data.derivation) {
            const { rule, sources } = data.derivation;
            html += `
                <div class="inspector-section">
                    <h4>Derivation Trace</h4>
                    <div class="prop-row">
                        <span class="prop-label">Rule</span>
                        <span class="prop-value" style="color:var(--accent-secondary)">${rule}</span>
                    </div>
                    <div class="related-tags">
                        ${sources.map(s => `<span class="related-tag" title="Source">${this._truncate(s, 15)}</span>`).join('')}
                    </div>
                    <button id="btn-trace-path" class="btn small-btn" style="margin-top:5px; width:100%">Show Trace Path 🔗</button>
                </div>
            `;
        }

        // Related Concepts (Derived from topology or explicit links if available)
        const related = data.links || [];
        html += `
            <div class="inspector-section">
                <h4>Related</h4>
                <div class="related-tags">
                   ${related.length ? related.map(r => `<span class="related-tag">${this._escapeHtml(r)}</span>`).join('') : '<span class="prop-value-dim">No direct links</span>'}
                </div>
            </div>
        `;

        const isControl = (mode === 'control');

        // Properties
        const fields = this._getEditableFields(data);

        // Internal State Tab/Section
        if (data.fullData) {
             const internalJson = JSON.stringify(data.fullData, null, 2);
             html += `
                <div class="inspector-section collapsed">
                    <h4 onclick="this.parentNode.classList.toggle('collapsed')">Internal State ▶</h4>
                    <pre class="internal-state-code">${this._escapeHtml(internalJson)}</pre>
                </div>
             `;
        }

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
                let formattedVal = displayVal;
                if (key === 'term' || key === 'label') {
                    formattedVal = NarseseHighlighter.highlight(String(value));
                }

                html += `
                    <div class="prop-row">
                        <span class="prop-label">${key}</span>
                        <span class="prop-value">${formattedVal}</span>
                    </div>
                `;
            }
        });

        if (isControl) {
            html += `
                <div style="margin-top: 10px; text-align: right;">
                    <button id="btn-inspector-query" class="btn small-btn" style="margin-right: 5px;">Query</button>
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
            const btnQuery = content.querySelector('#btn-inspector-query');
            if (btnQuery) {
                btnQuery.onclick = () => this._handleQuery();
            }
        }

        const btnTrace = content.querySelector('#btn-trace-path');
        if (btnTrace) {
            btnTrace.onclick = () => {
                if (this.onTrace) this.onTrace(this.currentData.id);
            };
        }
    }

    _handleQuery() {
        if (this.onQuery && this.currentData) {
            this.onQuery(this.currentData.id || this.currentData.term);
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
        if (data.budget && typeof data.budget === 'object') {
            ['priority', 'durability', 'quality'].forEach(k => {
                if (data.budget[k] !== undefined) {
                    fields.push({ key: `budget.${k}`, value: data.budget[k], type: 'number', path: `budget.${k}` });
                }
            });
        }

        if (data.truth && typeof data.truth === 'object') {
            ['frequency', 'confidence'].forEach(k => {
                if (data.truth[k] !== undefined) {
                    fields.push({ key: `truth.${k}`, value: data.truth[k], type: 'number', path: `truth.${k}` });
                }
            });
        }

        // Handle other properties (Generic Support)
        for (const [key, value] of Object.entries(data)) {
            if (['weight', 'id', 'budget', 'truth', 'fullData', 'tasks', 'links', 'derivation'].includes(key)) continue;
            if (priorityKeys.includes(key)) continue; // Already added

            if (value && typeof value === 'object') {
                // Show generic objects as JSON string, safe against circular refs
                let strVal = '[Object]';
                try {
                    strVal = JSON.stringify(value);
                } catch (e) {
                    strVal = '[Circular/Error]';
                }
                fields.push({ key: key, value: strVal, type: 'object', path: key });
            } else {
                fields.push({ key, value, type: typeof value, path: key });
            }
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
        return (str.length > n) ? str.substr(0, n - 1) + '...' : str;
    }

    _escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
