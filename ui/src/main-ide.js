import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { LocalConnectionManager } from './connection/LocalConnectionManager.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { CommandProcessor } from './command/CommandProcessor.js';
import { ThemeManager } from './components/ThemeManager.js';
import { Logger } from './logging/Logger.js';
import { StatusBar } from './components/StatusBar.js';
import { DemoLibraryModal } from './components/DemoLibraryModal.js';
import { LayoutManager } from './layout/LayoutManager.js';
import { MessageRouter } from './messaging/MessageRouter.js';
import { SettingsManager } from './config/SettingsManager.js';
import { EVENTS, COMPONENTS, MODES } from './config/constants.js';
import { eventBus } from './core/EventBus.js';
import { ShortcutManager } from './core/ShortcutManager.js';

cytoscape.use(fcose);
window.cytoscape = cytoscape;

class SeNARSIDE {
    constructor() {
        this.settingsManager = new SettingsManager();
        this.layoutManager = new LayoutManager(this, 'layout-root');
        this.messageRouter = new MessageRouter(this);
        this.connection = null;
        this.components = new Map();
        this.graphManager = null;
        this.themeManager = new ThemeManager();
        this.logger = new Logger();
        this.commandProcessor = null;
        this.lmActivityIndicator = null;
        this.cycleCount = 0;
        this.messageCount = 0;
        this.isRunning = false;
        this.statusBar = null;
        this.shortcutManager = new ShortcutManager();

        const urlParams = new URLSearchParams(window.location.search);
        this.presetName = urlParams.get('layout') || 'ide';

        const modeParam = urlParams.get('mode');
        if (modeParam && Object.values(MODES).includes(modeParam)) {
            this.settingsManager.setMode(modeParam);
        }

        if (window.location.pathname.endsWith('demo.html')) {
            this.presetName = 'demo';
        }

        this.presetName ||= 'ide';

        const aliases = { console: 'repl', online: 'dashboard' };
        this.presetName = aliases[this.presetName] ?? this.presetName;
    }

    registerComponent(name, instance) {
        this.components.set(name, instance);
        if (name === 'graph') {
            this.graphManager = instance.graphManager;
            this.commandProcessor?.setGraphManager(this.graphManager);
        }
    }

    async initialize() {
        try {
            this.statusBar = new StatusBar(document.getElementById('status-bar-root'));
            this.statusBar.initialize({
                onModeSwitch: () => this.showConnectionModal(),
                onThemeToggle: () => this.toggleTheme()
            });

            this.layoutManager.initialize(this.presetName);

            await this.switchMode(this.settingsManager.getMode());
            this.setupShortcuts();

            eventBus.on(EVENTS.CONCEPT_SELECT, (payload) => this._onConceptSelect(payload));
        } catch (error) {
            this.logger.log(`Initialization error: ${error.message}`, 'error');
            console.error('SeNARS IDE Initialization failed:', error);
        }
    }

    _onConceptSelect(payload) {
        const concept = payload?.concept;
        if (!concept) return;
        const memoryComponent = this.layoutManager.layout.root.getItemsByFilter(item => item.config.componentName === COMPONENTS.MEMORY)[0];
        memoryComponent?.parent?.setActiveContentItem?.(memoryComponent);
    }

    getNotebook() {
        return this.components.get('notebook')?.notebookManager;
    }

    async switchMode(mode) {
        try {
            this.connection?.disconnect();
            this.settingsManager.setMode(mode);

            await this._setupConnection(mode);

            if (this.commandProcessor) {
                this.commandProcessor.connection = this.connection;
            } else {
                this.commandProcessor = new CommandProcessor(this.connection, this.logger, this.graphManager);
            }

            this.graphManager?.setCommandProcessor(this.commandProcessor);
            this.updateModeIndicator();
        } catch (error) {
            this.logger.log(`Mode switch error: ${error.message}`, 'error');
            console.error('Failed to switch mode:', error);
        }
    }

    async _setupConnection(mode) {
        const manager = mode === MODES.LOCAL ? new LocalConnectionManager() : new WebSocketManager();
        this.connection = new ConnectionManager(manager);

        await this.connection.connect(mode === MODES.REMOTE ? this.settingsManager.getServerUrl() : undefined);

        this.connection.subscribe('*', (message) => this.messageRouter.handleMessage(message));
        this.connection.subscribe('connection.status', (status) => this.statusBar?.updateStatus(status));
    }

    updateModeIndicator() {
        this.statusBar?.updateMode(this.settingsManager.getMode());
        this.statusBar?.updateStatus(this.connection?.isConnected() ? 'Connected' : 'Disconnected');
    }

    showConnectionModal() {
        if (this.settingsManager.getMode() === MODES.LOCAL) {
            const defaultUrl = this.settingsManager.getServerUrl() || 'ws://localhost:3000';
            const url = prompt('Enter Remote Server URL:', defaultUrl);
            if (url !== null) {
                this.settingsManager.setServerUrl(url);
                this.switchMode(MODES.REMOTE);
            }
        } else if (confirm('Switch to Local Mode?')) {
            this.switchMode(MODES.LOCAL);
        }
    }

    updateStats() {
        const notebook = this.components.get('notebook');
        notebook?.notebookInput?.updateCycles(this.cycleCount);

        this.statusBar?.updateStats({
            cycles: this.cycleCount,
            messages: this.messageCount
        });
    }

    setupShortcuts() {
        // Register Global Shortcuts
        this.shortcutManager.register({
            key: 'l', ctrl: true, desc: 'Clear Notebook',
            handler: () => this.getNotebook()?.clear()
        });

        this.shortcutManager.register({
            key: 'D', ctrl: true, shift: true, desc: 'Demo Library',
            handler: () => new DemoLibraryModal(this.getNotebook()).show()
        });

        this.shortcutManager.register({
            key: 's', ctrl: true, desc: 'Save Notebook',
            handler: () => {
                this.getNotebook()?.saveToStorage();
                this.getNotebook()?.createResultCell('💾 Notebook saved', 'system');
            }
        });

        this.shortcutManager.register({
            key: 'o', ctrl: true, desc: 'Load Notebook File',
            handler: () => this.triggerLoadFile()
        });

        this.shortcutManager.register({
            key: 'b', ctrl: true, desc: 'Toggle Sidebar',
            handler: () => this.layoutManager.toggleSidebar()
        });

        this.shortcutManager.register({
            key: 'f', ctrl: true, shift: true, desc: 'Search Memory',
            handler: () => {
                const memComp = this.components.get('memory');
                memComp?.focusFilter?.();
            }
        });

        this.shortcutManager.register({
            key: 'F1', desc: 'Help (Shortcuts)',
            handler: () => this.shortcutManager.showHelpModal()
        });

        // Document specific shortcuts that are handled within components but we list here for help
        this.shortcutManager.shortcuts.push(
            { key: 'Enter', ctrl: true, desc: 'Execute Cell (Notebook)' },
            { key: 'Enter', shift: true, desc: 'Execute & Advance (Notebook)' }
        );
    }

    triggerLoadFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const notebook = this.components.get('notebook');
                if (notebook) {
                    notebook.importNotebookFile(file);
                }
            }
        };
        input.click();
    }

    toggleTheme() {
        const themes = ['default', 'light', 'contrast'];
        const current = this.themeManager.getTheme();
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        this.themeManager.setTheme(next);
        this.logger.log(`Theme set to: ${next}`, 'system');
    }
}

async function start() {
    const ide = new SeNARSIDE();
    window.SeNARSIDE = ide;
    await ide.initialize();
}

window.addEventListener('DOMContentLoaded', start);
