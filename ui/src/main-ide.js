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
import { Modal } from './components/ui/Modal.js';

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
        this.presetName = urlParams.get('layout') || 'ide';

        const modeParam = urlParams.get('mode');
        if (modeParam && Object.values(MODES).includes(modeParam)) {
            this.settingsManager.setMode(modeParam);
        }

        if (window.location.pathname.endsWith('demo.html')) {
            this.presetName = 'demo';
        }

        this.presetName ||= 'ide';

        // Map common aliases
        const aliases = { console: 'repl', online: 'dashboard' };
        this.presetName = aliases[this.presetName] ?? this.presetName;
    }

    registerComponent(name, instance) {
        this.components.set(name, instance);
        if (name === 'graph') this.graphManager = instance.graphManager;
    }

    async initialize() {
        this.logger.log(`Initializing SeNARS IDE (Layout: ${this.presetName})...`, 'system');

        this.statusBar = new StatusBar(document.getElementById('status-bar-root'));
        this.statusBar.initialize({ onModeSwitch: () => this.showConnectionModal() });

        this.layoutManager.initialize(this.presetName);

        await this.switchMode(this.settingsManager.getMode());
        this.setupKeyboardShortcuts();

        // Listen for concept selection (Global Event Bus & DOM)
        const onConceptSelect = (concept) => {
            if (!concept) return;
             // Open Memory Inspector if available
             const memoryComponent = this.layoutManager.layout.root.getItemsByFilter(item => item.config.componentName === COMPONENTS.MEMORY)[0];
             memoryComponent?.parent?.setActiveContentItem?.(memoryComponent);
        };

        eventBus.on('concept:select', onConceptSelect);
        document.addEventListener(EVENTS.CONCEPT_SELECT, (e) => onConceptSelect(e.detail?.concept));

        this.logger.log(`SeNARS IDE initialized in ${this.settingsManager.getMode()} mode`, 'success');
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
            this.commandProcessor = new CommandProcessor(this.connection, this.logger, this.graphManager);
        }

        this.graphManager?.setCommandProcessor(this.commandProcessor);

        this.updateModeIndicator();
        this.getNotebook()?.createResultCell(`🚀 Connected in ${mode} mode`, 'system');
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
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.getNotebook()?.saveToStorage();
                this.getNotebook()?.createResultCell('💾 Notebook saved', 'system');
            }
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                this.layoutManager.toggleSidebar();
            }
            if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                e.preventDefault();
                const memComp = this.components.get('memory');
                memComp?.focusFilter?.();
            }
            if (e.key === 'F1') {
                e.preventDefault();
                this.showHelpModal();
            }
        });
    }

    showHelpModal() {
        const shortcuts = [
            { key: 'Ctrl + Enter', desc: 'Execute Cell' },
            { key: 'Shift + Enter', desc: 'Execute & Advance' },
            { key: 'Ctrl + L', desc: 'Clear Notebook' },
            { key: 'Ctrl + S', desc: 'Save Notebook' },
            { key: 'Ctrl + B', desc: 'Toggle Sidebar' },
            { key: 'Ctrl + Shift + F', desc: 'Search Memory' },
            { key: 'Ctrl + Shift + D', desc: 'Demo Library' },
            { key: 'F1', desc: 'Help (Shortcuts)' }
        ];

        const content = shortcuts.map(s => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #333;">
                <span style="font-family: monospace; color: #00ff9d; font-weight: bold;">${s.key}</span>
                <span style="color: #ccc;">${s.desc}</span>
            </div>
        `).join('');

        new Modal({
            title: '⌨️ Global Shortcuts',
            content,
            width: '450px'
        }).show();
    }
}

async function start() {
    const ide = new SeNARSIDE();
    window.SeNARSIDE = ide;
    await ide.initialize();
}

window.addEventListener('DOMContentLoaded', start);
