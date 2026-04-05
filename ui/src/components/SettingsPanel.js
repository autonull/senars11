import { Component } from './Component.js';
import { Modal } from './ui/Modal.js';
import { FluentUI } from '../utils/FluentUI.js';
import { EVENTS } from '../config/constants.js';
import { eventBus } from '../core/EventBus.js';

export class SettingsPanel extends Component {
    constructor(container) {
        super(container);
    }

    initialize() {
        if (!this.container) {return;}
        this.render();
    }

    render() {
        this.fluent().clear().class('settings-container')
            .child(this._renderWorkspaceSection())
            .child(this._renderUISettingsSection())
            .child(this._renderConnectionSection())
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
                .child(FluentUI.create('input').attr({ type: 'text', id: 'setting-server-url', value: serverUrl, placeholder: 'ws://localhost:3000' }).class('setting-input')),
            true // Collapsed by default for connection
        );
    }

    _renderSection(title, content, defaultCollapsed = false) {
        const wrapper = FluentUI.create('div').class('settings-section-wrapper').style({ marginBottom: '10px' });

        // Header
        const header = FluentUI.create('div').class('settings-section-header')
            .style({ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '5px 0', borderBottom: '1px solid #444' })
            .mount(wrapper);

        const icon = FluentUI.create('span')
            .text(defaultCollapsed ? '▶' : '▼')
            .style({ marginRight: '8px', fontSize: '10px', width: '12px', color: '#888' })
            .mount(header);

        FluentUI.create('h3')
            .class('settings-header')
            .text(title)
            .style({ margin: '0' })
            .mount(header);

        // Content
        const contentContainer = FluentUI.create('div').class('settings-section-content')
            .style({ display: defaultCollapsed ? 'none' : 'block', marginTop: '10px' })
            .mount(wrapper);

        // Append content children
        if (Array.isArray(content)) {
            content.forEach(c => contentContainer.child(c));
        } else {
            contentContainer.child(content);
        }

        // Toggle logic
        header.on('click', () => {
            const isHidden = contentContainer.dom.style.display === 'none';
            contentContainer.style({ display: isHidden ? 'block' : 'none' });
            icon.text(isHidden ? '▼' : '▶');
        });

        return wrapper;
    }

    _saveWorkspace() {
        if (!this.app) {return;}

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
            if (!file) {return;}

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
        if (!this.app) {return;}

        if (await Modal.confirm('Load workspace? Current state will be overwritten.')) {
            // Restore Settings
            if (workspace.settings) {
                if (workspace.settings.theme) {this.app.themeManager?.setTheme(workspace.settings.theme);}
                if (workspace.settings.serverUrl) {this.app.serverUrl = workspace.settings.serverUrl;}
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

        eventBus.emit(EVENTS.SETTINGS_UPDATED);
    }
}
