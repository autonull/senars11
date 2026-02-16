import { Component } from './Component.js';
import { GraphConfig } from '../config/GraphConfig.js';
import { Config } from '../config/Config.js';

export class SettingsPanel extends Component {
    constructor(container) {
        super(container);
    }

    initialize() {
        if (!this.container) return;

        this.container.style.overflow = 'auto';
        this.container.style.padding = '10px';
        this.container.style.fontFamily = 'var(--font-mono)';

        this.render();
    }

    render() {
        // Get current defaults
        const layout = GraphConfig.getGraphLayout('fcose');
        const theme = this.app?.themeManager?.getTheme() || 'default';
        const serverUrl = this.app?.serverUrl || '';

        this.container.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h3 style="color:var(--text-muted); font-size:12px; border-bottom:1px solid #333; padding-bottom:5px;">UI SETTINGS</h3>
                <div style="margin-bottom: 8px;">
                    <label style="display:block; font-size:11px; color:#aaa; margin-bottom:4px;">Theme</label>
                    <select id="setting-theme" style="width:100%; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color);">
                        <option value="default" ${theme === 'default' ? 'selected' : ''}>Dark (Default)</option>
                        <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
                        <option value="contrast" ${theme === 'contrast' ? 'selected' : ''}>High Contrast</option>
                    </select>
                </div>
                <div style="margin-bottom: 8px;">
                    <button id="reset-layout" style="width:100%; border:1px solid var(--accent-error); color:var(--accent-error);">RESET LAYOUT</button>
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <h3 style="color:var(--text-muted); font-size:12px; border-bottom:1px solid #333; padding-bottom:5px;">CONNECTION</h3>
                <div style="margin-bottom: 8px;">
                    <label style="display:block; font-size:11px; color:#aaa; margin-bottom:4px;">Server URL</label>
                    <input type="text" id="setting-server-url" value="${serverUrl}" placeholder="ws://localhost:3000" style="width:100%">
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <h3 style="color:var(--text-muted); font-size:12px; border-bottom:1px solid #333; padding-bottom:5px;">GRAPH PHYSICS (fCoSE)</h3>
                ${this._renderSlider('Gravity', 'gravity', 0, 1, 0.05, layout.gravity)}
                ${this._renderSlider('Repulsion', 'nodeRepulsion', 100000, 1000000, 50000, layout.nodeRepulsion)}
                ${this._renderSlider('Edge Length', 'idealEdgeLength', 50, 300, 10, layout.idealEdgeLength)}
            </div>

            <div style="margin-bottom: 15px;">
                <h3 style="color:var(--text-muted); font-size:12px; border-bottom:1px solid #333; padding-bottom:5px;">COLORS</h3>
                ${this._renderColorPicker('Concept', 'CONCEPT')}
                ${this._renderColorPicker('Task', 'TASK')}
                ${this._renderColorPicker('Question', 'QUESTION')}
                ${this._renderColorPicker('Highlight', 'HIGHLIGHT')}
            </div>

            <button id="apply-settings" style="width:100%; padding:8px;">APPLY SETTINGS</button>
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
            <div style="margin-bottom: 8px;">
                <label style="display:flex; justify-content:space-between; font-size:11px; color:#aaa;">
                    ${label} <span id="val-${key}">${value}</span>
                </label>
                <input type="range" id="setting-${key}" min="${min}" max="${max}" step="${step}" value="${value}" style="width:100%">
            </div>
        `;
    }

    _renderColorPicker(label, key) {
        const val = GraphConfig.COLORS[key] || '#ffffff';
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <label style="font-size:11px; color:#aaa;">${label}</label>
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

        // Update Physics (This is trickier as getGraphLayout returns a new object)
        // We'll need to monkey-patch or update a shared config object if we want persistence.
        // For now, let's assume GraphConfig.getGraphLayout is just returning a fresh object,
        // but we can't easily modify the *default*.
        // BUT, we can dispatch the new config in the event!

        const physics = {};
        ['gravity', 'nodeRepulsion', 'idealEdgeLength'].forEach(key => {
             const input = this.container.querySelector(`#setting-${key}`);
             if(input) physics[key] = parseFloat(input.value);
        });

        // We need to store these overrides somewhere.
        // Let's add a static overrides object to GraphConfig or just pass it in the event.
        if (!GraphConfig.OVERRIDES) GraphConfig.OVERRIDES = {};
        Object.assign(GraphConfig.OVERRIDES, physics);

        document.dispatchEvent(new CustomEvent('senars:settings:updated'));
    }
}
