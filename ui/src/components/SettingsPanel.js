import { Component } from './Component.js';
import { GraphConfig } from '../config/GraphConfig.js';

export class SettingsPanel extends Component {
    constructor(container) {
        super(container);
    }

    initialize() {
        if (!this.container) return;

        this.container.className = 'settings-container';

        this.render();
    }

    render() {
        // Get current defaults
        const layout = GraphConfig.getGraphLayout('fcose');
        const theme = this.app?.themeManager?.getTheme() || 'default';
        const serverUrl = this.app?.serverUrl || '';

        this.container.innerHTML = `
            <div class="settings-section">
                <h3 class="settings-header">UI SETTINGS</h3>
                <div class="setting-item">
                    <label class="setting-label">Theme</label>
                    <select id="setting-theme" class="setting-select">
                        <option value="default" ${theme === 'default' ? 'selected' : ''}>Dark (Default)</option>
                        <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
                        <option value="contrast" ${theme === 'contrast' ? 'selected' : ''}>High Contrast</option>
                    </select>
                </div>
                <div class="setting-item">
                    <button id="reset-layout" class="reset-btn">RESET LAYOUT</button>
                </div>
            </div>

            <div class="settings-section">
                <h3 class="settings-header">CONNECTION</h3>
                <div class="setting-item">
                    <label class="setting-label">Server URL</label>
                    <input type="text" id="setting-server-url" value="${serverUrl}" placeholder="ws://localhost:3000" class="setting-input">
                </div>
            </div>

            <div class="settings-section">
                <h3 class="settings-header">GRAPH PHYSICS (fCoSE)</h3>
                ${this._renderSlider('Gravity', 'gravity', 0, 1, 0.05, layout.gravity)}
                ${this._renderSlider('Repulsion', 'nodeRepulsion', 100000, 1000000, 50000, layout.nodeRepulsion)}
                ${this._renderSlider('Edge Length', 'idealEdgeLength', 50, 300, 10, layout.idealEdgeLength)}
            </div>

            <div class="settings-section">
                <h3 class="settings-header">COLORS</h3>
                ${this._renderColorPicker('Concept', 'CONCEPT')}
                ${this._renderColorPicker('Task', 'TASK')}
                ${this._renderColorPicker('Question', 'QUESTION')}
                ${this._renderColorPicker('Highlight', 'HIGHLIGHT')}
            </div>

            <button id="apply-settings" class="apply-btn">APPLY SETTINGS</button>
        `;

        // Bind events
        this.container.querySelectorAll('input[type=range]').forEach(input => {
             const key = input.id.replace('setting-', '');
             const valSpan = this.container.querySelector(`#val-${key}`);
             if(valSpan) valSpan.textContent = input.value;

             input.addEventListener('input', (e) => {
                 if(valSpan) valSpan.textContent = e.target.value;
             });
        });

        this.container.querySelector('#setting-theme').addEventListener('change', (e) => {
             this.app?.themeManager?.setTheme(e.target.value);
        });

        this.container.querySelector('#reset-layout').addEventListener('click', () => {
             if(confirm('Reset layout to default? This will reload the page.')) {
                 localStorage.removeItem('senars-ide-layout');
                 location.reload();
             }
        });

        this.container.querySelector('#apply-settings').addEventListener('click', () => {
             this._applySettings();
        });
    }

    _renderSlider(label, key, min, max, step, value) {
        return `
            <div class="setting-item">
                <label class="setting-label-row">
                    ${label} <span id="val-${key}">${value}</span>
                </label>
                <input type="range" id="setting-${key}" min="${min}" max="${max}" step="${step}" value="${value}" class="setting-input">
            </div>
        `;
    }

    _renderColorPicker(label, key) {
        const val = GraphConfig.COLORS[key] || '#ffffff';
        return `
            <div class="setting-color-row">
                <label class="setting-label">${label}</label>
                <input type="color" id="color-${key}" value="${val}" style="border:none; width:30px; height:20px; padding:0; background:none;">
            </div>
        `;
    }

    _applySettings() {
        // Update Connection
        const urlInput = this.container.querySelector('#setting-server-url');
        if (urlInput && this.app) {
            this.app.serverUrl = urlInput.value;
            this.app.saveSettings();
        }

        // Update Colors
        const colors = ['CONCEPT', 'TASK', 'QUESTION', 'HIGHLIGHT'];

        colors.forEach(key => {
            const input = this.container.querySelector(`#color-${key}`);
            if (input && GraphConfig.COLORS[key] !== input.value) {
                GraphConfig.COLORS[key] = input.value;
            }
        });

        const physics = {};
        ['gravity', 'nodeRepulsion', 'idealEdgeLength'].forEach(key => {
             const input = this.container.querySelector(`#setting-${key}`);
             if(input) physics[key] = parseFloat(input.value);
        });

        if (!GraphConfig.OVERRIDES) GraphConfig.OVERRIDES = {};
        Object.assign(GraphConfig.OVERRIDES, physics);

        // Save to persistence (handled in GraphConfig now)
        if (GraphConfig.save) GraphConfig.save();

        document.dispatchEvent(new CustomEvent('senars:settings:updated'));
    }
}
