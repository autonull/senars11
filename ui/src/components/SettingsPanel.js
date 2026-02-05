import { Component } from './Component.js';
import { GraphConfig } from '../config/GraphConfig.js';
import { Modal } from './ui/Modal.js';
import { FluentUI } from '../utils/FluentUI.js';

export class SettingsPanel extends Component {
    constructor(container) {
        super(container);
    }

    initialize() {
        if (!this.container) return;
        this.render();
    }

    render() {
        this.fluent().clear().class('settings-container')
            .child(this._renderWorkspaceSection())
            .child(this._renderUISettingsSection())
            .child(this._renderConnectionSection())
            .child(this._renderPhysicsSection())
            .child(this._renderColorsSection())
            .child(
                FluentUI.create('button')
                    .id('apply-settings')
                    .class('apply-btn')
                    .text('APPLY SETTINGS')
                    .on('click', () => this._applySettings())
            );
    }

    _renderWorkspaceSection() {
        return this._renderSection('WORKSPACE',
            FluentUI.create('div').style({ display: 'flex', gap: '8px' })
                .child(FluentUI.create('button').class('toolbar-btn primary').style({ flex: '1' }).text('💾 Save Workspace').on('click', () => this._saveWorkspace()))
                .child(FluentUI.create('button').class('toolbar-btn').style({ flex: '1' }).text('📂 Load Workspace').on('click', () => this._loadWorkspace()))
        );
    }

    _renderUISettingsSection() {
        const theme = this.app?.themeManager?.getTheme() || 'default';
        return this._renderSection('UI SETTINGS', [
            FluentUI.create('div').class('setting-item')
                .child(FluentUI.create('label').class('setting-label').text('Theme'))
                .child(
                    FluentUI.create('select')
                        .id('setting-theme')
                        .class('setting-select')
                        .on('change', (e) => this.app?.themeManager?.setTheme(e.target.value))
                        .children([
                            { v: 'default', l: 'Dark (Default)' },
                            { v: 'light', l: 'Light' },
                            { v: 'contrast', l: 'High Contrast' }
                        ].map(opt => FluentUI.create('option').attr({ value: opt.v }).text(opt.l).prop({ selected: theme === opt.v })))
                ),
            FluentUI.create('div').class('setting-item')
                .child(
                    FluentUI.create('button')
                        .id('reset-layout')
                        .class('reset-btn')
                        .text('RESET LAYOUT')
                        .on('click', async () => {
                            if (await Modal.confirm('Reset layout to default? This will reload the page.')) {
                                localStorage.removeItem('senars-ide-layout');
                                location.reload();
                            }
                        })
                )
        ]);
    }

    _renderConnectionSection() {
        const serverUrl = this.app?.serverUrl || '';
        return this._renderSection('CONNECTION',
            FluentUI.create('div').class('setting-item')
                .child(FluentUI.create('label').class('setting-label').text('Server URL'))
                .child(FluentUI.create('input').attr({ type: 'text', id: 'setting-server-url', value: serverUrl, placeholder: 'ws://localhost:3000' }).class('setting-input'))
        );
    }

    _renderPhysicsSection() {
        const layout = GraphConfig.getGraphLayout('fcose');
        return this._renderSection('GRAPH PHYSICS (fCoSE)', [
            this._createSlider('Gravity', 'gravity', 0, 1, 0.05, layout.gravity),
            this._createSlider('Repulsion', 'nodeRepulsion', 100000, 1000000, 50000, layout.nodeRepulsion),
            this._createSlider('Edge Length', 'idealEdgeLength', 50, 300, 10, layout.idealEdgeLength)
        ]);
    }

    _renderColorsSection() {
        return this._renderSection('COLORS', [
            this._createColorPicker('Concept', 'CONCEPT'),
            this._createColorPicker('Task', 'TASK'),
            this._createColorPicker('Question', 'QUESTION'),
            this._createColorPicker('Highlight', 'HIGHLIGHT')
        ]);
    }

    _renderSection(title, content) {
        return FluentUI.create('div').class('settings-section')
            .child(FluentUI.create('h3').class('settings-header').text(title))
            .children(content); // content can be single or array, FluentUI handles it
    }

    _createSlider(label, key, min, max, step, value) {
        const valSpan = FluentUI.create('span').id(`val-${key}`).text(value);

        return FluentUI.create('div').class('setting-item')
            .child(
                FluentUI.create('label').class('setting-label-row')
                    .text(label + ' ')
                    .child(valSpan)
            )
            .child(
                FluentUI.create('input')
                    .attr({ type: 'range', id: `setting-${key}`, min, max, step, value })
                    .class('setting-input')
                    .on('input', (e) => valSpan.text(e.target.value))
            );
    }

    _createColorPicker(label, key) {
        const val = GraphConfig.COLORS[key] || '#ffffff';
        return FluentUI.create('div').class('setting-color-row')
            .child(FluentUI.create('label').class('setting-label').text(label))
            .child(FluentUI.create('input').attr({ type: 'color', id: `color-${key}`, value: val }).class('setting-color-input'));
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

    async _restoreWorkspace(workspace) {
        if (!this.app) return;

        if (await Modal.confirm('Load workspace? Current state will be overwritten.')) {
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
            if (workspace.layout) {
                localStorage.setItem(`senars-layout-${this.app.presetName || 'ide'}`, JSON.stringify(workspace.layout));
                await Modal.alert('Workspace loaded. Page will reload to apply layout changes.');
                location.reload();
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
