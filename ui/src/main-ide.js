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
        this.logger = new Logger(); // Core logger
        this.commandProcessor = null;
        this.lmActivityIndicator = null;
        this.cycleCount = 0;
        this.messageCount = 0;
        this.isRunning = false;
        this.statusBar = null;

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

        await this.switchMode(this.settingsManager.getMode());
        this.setupKeyboardShortcuts();

        // Listen for concept selection (Global Event Bus)
        document.addEventListener(EVENTS.CONCEPT_SELECT, (e) => this.handleConceptSelect(e));

        this.logger.log(`SeNARS IDE initialized in ${this.settingsManager.getMode()} mode`, 'success');
    }

    handleConceptSelect(e) {
        const { concept } = e.detail;
        if (concept) {
             // Open Memory Inspector if available
             const memoryComponent = this.layoutManager.layout.root.getItemsByFilter(item => item.config.componentName === COMPONENTS.MEMORY)[0];
             memoryComponent?.parent?.setActiveContentItem?.(memoryComponent);
        }
    }

    getNotebook() {
        return this.components.get('notebook')?.notebookManager;
    }

    async switchMode(mode) {
        this.logger.log(`Switching to ${mode} mode...`, 'system');
        this.connection?.disconnect();
        this.settingsManager.setMode(mode);

        const manager = mode === MODES.LOCAL ? new LocalConnectionManager() : new WebSocketManager();
        this.connection = new ConnectionManager(manager);

        await this.connection.connect(mode === MODES.REMOTE ? this.settingsManager.getServerUrl() : undefined);

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

        const notebook = this.getNotebook();
        notebook?.createResultCell(`🚀 Connected in ${mode} mode`, 'system');
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
        } else {
            if (confirm('Switch to Local Mode?')) {
                this.switchMode(MODES.LOCAL);
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
