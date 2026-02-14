import { Component } from './Component.js';
import { GraphConfig } from '../config/GraphConfig.js';
import { Modal } from './ui/Modal.js';

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
                <h3 class="settings-header">WORKSPACE</h3>
                <div class="setting-item" style="display: flex; gap: 8px;">
                    <button id="save-workspace" class="toolbar-btn primary" style="flex:1;">💾 Save Workspace</button>
                    <button id="load-workspace" class="toolbar-btn" style="flex:1;">📂 Load Workspace</button>
                </div>
            </div>

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

        this.container.querySelector('#save-workspace').addEventListener('click', () => this._saveWorkspace());
        this.container.querySelector('#load-workspace').addEventListener('click', () => this._loadWorkspace());
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
                <input type="color" id="color-${key}" value="${val}" class="setting-color-input">
            </div>
        `;
    }

    _saveWorkspace() {
        if (!this.app) return;

        const notebookData = this.app.getNotebook()?.exportNotebook() || [];
        const layoutConfig = this.app.layoutManager?.layout?.toConfig();

        const workspace = {
            version: 1,
            timestamp: new Date().toISOString(),
            notebook: notebookData,
            layout: layoutConfig,
            settings: {
                theme: this.app.themeManager?.getTheme(),
                serverUrl: this.app.serverUrl
            }
        };

        const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `senars-workspace-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    _loadWorkspace() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const workspace = JSON.parse(e.target.result);
                    this._restoreWorkspace(workspace);
                } catch (err) {
                    console.error('Failed to load workspace', err);
                    Modal.alert('Invalid workspace file.');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    _restoreWorkspace(workspace) {
        if (!this.app) return;

        if (confirm('Load workspace? Current state will be overwritten.')) {
            // Restore Settings
            if (workspace.settings) {
                if (workspace.settings.theme) this.app.themeManager?.setTheme(workspace.settings.theme);
                if (workspace.settings.serverUrl) this.app.serverUrl = workspace.settings.serverUrl;
            }

            // Restore Notebook
            if (workspace.notebook && this.app.getNotebook()) {
                this.app.getNotebook().importNotebook(workspace.notebook);
            }

            // Restore Layout
            // Note: Restoring GoldenLayout config usually requires destroying and recreating the layout instance.
            // For simplicity in this session, we might skip layout restore or require reload.
            // Here we will just save it to local storage and ask reload
            if (workspace.layout) {
                localStorage.setItem(`senars-layout-${this.app.presetName || 'ide'}`, JSON.stringify(workspace.layout));
                Modal.alert('Workspace loaded. Page will reload to apply layout changes.').then(() => location.reload());
            } else {
                Modal.alert('Workspace loaded (Notebook and Settings).');
            }
        }
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
