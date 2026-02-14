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

cytoscape.use(fcose);
window.cytoscape = cytoscape;

class SeNARSIDE {
    constructor() {
        this.layoutManager = new LayoutManager(this, 'layout-root');
        this.messageRouter = new MessageRouter(this);
        this.connection = null;
        this.connectionMode = 'local';
        this.components = new Map();
        this.graphManager = null;
        this.themeManager = new ThemeManager();
        this.logger = new Logger(); // Core logger
        this.commandProcessor = null;
        this.lmActivityIndicator = null;
        this.cycleCount = 0;
        this.messageCount = 0;
        this.isRunning = false;
        this.statusBar = null;

        this.loadSettings();

        // Handle URL params for mode/layout
        const urlParams = new URLSearchParams(window.location.search);
        this.presetName = urlParams.get('layout') || urlParams.get('mode');

        if (!this.presetName && window.location.pathname.endsWith('demo.html')) {
            this.presetName = 'demo';
        }

        this.presetName ||= 'ide';

        // Map common aliases
        const aliases = { console: 'repl', online: 'dashboard' };
        if (aliases[this.presetName]) this.presetName = aliases[this.presetName];
    }

    loadSettings() {
        const saved = localStorage.getItem('senars-ide-settings');
        if (saved) {
            const settings = JSON.parse(saved);
            this.connectionMode = settings.mode ?? 'local';
            this.serverUrl = settings.serverUrl ?? 'localhost:3000';
        }
    }

    saveSettings() {
        localStorage.setItem('senars-ide-settings', JSON.stringify({
            mode: this.connectionMode,
            serverUrl: this.serverUrl
        }));
    }

    registerComponent(name, instance) {
        this.components.set(name, instance);
        if (name === 'graph') {
            this.graphManager = instance.graphManager;
        }
    }

    async initialize() {
        this.logger.log(`Initializing SeNARS IDE (Layout: ${this.presetName})...`, 'system');

        this.statusBar = new StatusBar(document.getElementById('status-bar-root'));
        this.statusBar.initialize({ onModeSwitch: () => this.showConnectionModal() });

        this.layoutManager.initialize(this.presetName);

        await this.switchMode(this.connectionMode);
        this.setupKeyboardShortcuts();

        // Listen for concept selection (Global Event Bus)
        document.addEventListener('senars:concept:select', (e) => this.handleConceptSelect(e));

        this.logger.log(`SeNARS IDE initialized in ${this.connectionMode} mode`, 'success');
    }

    handleConceptSelect(e) {
        const { concept } = e.detail;
        if (concept) {
             // Open Memory Inspector if available
             const memoryComponent = this.layoutManager.layout.root.getItemsByFilter(item => item.config.componentName === 'memoryComponent')[0];
             memoryComponent?.parent?.setActiveContentItem?.(memoryComponent);
        }
    }

    getNotebook() {
        return this.components.get('notebook')?.notebookManager;
    }

    async switchMode(mode) {
        this.logger.log(`Switching to ${mode} mode...`, 'system');
        this.connection?.disconnect();
        this.connectionMode = mode;

        const manager = mode === 'local' ? new LocalConnectionManager() : new WebSocketManager();
        this.connection = new ConnectionManager(manager);

        await this.connection.connect(mode === 'remote' ? this.serverUrl : undefined);

        this.connection.subscribe('*', (message) => this.messageRouter.handleMessage(message));
        this.connection.subscribe('connection.status', (status) => this.statusBar?.updateStatus(status));

        // Update CommandProcessor with new connection
        if (this.commandProcessor) {
            this.commandProcessor.connection = this.connection;
        } else {
            // Check if we have a repl panel to hook logger (now NotebookPanel)
            this.commandProcessor = new CommandProcessor(this.connection, this.logger, this.graphManager);
        }

        // Ensure GraphManager has access to CommandProcessor (for ContextMenu)
        if (this.graphManager && this.commandProcessor) {
            this.graphManager.setCommandProcessor(this.commandProcessor);
        }

        this.updateModeIndicator();
        this.saveSettings();

        const notebook = this.getNotebook();
        notebook?.createResultCell(`🚀 Connected in ${mode} mode`, 'system');
    }

    updateModeIndicator() {
        this.statusBar?.updateMode(this.connectionMode);
        this.statusBar?.updateStatus(this.connection?.isConnected() ? 'Connected' : 'Disconnected');
    }

    showConnectionModal() {
        if (this.connectionMode === 'local') {
            const defaultUrl = this.serverUrl || 'ws://localhost:3000';
            const url = prompt('Enter Remote Server URL:', defaultUrl);
            if (url !== null) {
                this.serverUrl = url;
                this.switchMode('remote');
            }
        } else {
            if (confirm('Switch to Local Mode?')) {
                this.switchMode('local');
            }
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

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.getNotebook()?.clear();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                new DemoLibraryModal(this.getNotebook()).show();
            }
        });
    }
}

async function start() {
    const ide = new SeNARSIDE();
    window.SeNARSIDE = ide;
    await ide.initialize();
}

window.addEventListener('DOMContentLoaded', start);
