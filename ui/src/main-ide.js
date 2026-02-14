import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { GoldenLayout } from 'golden-layout';
import { LocalConnectionManager } from './connection/LocalConnectionManager.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { GraphPanel } from './components/GraphPanel.js';
import { MemoryInspector } from './components/MemoryInspector.js';
import { DerivationTree } from './components/DerivationTree.js';
import { SystemMetricsPanel } from './components/SystemMetricsPanel.js';
import { REPLPanel } from './components/REPLPanel.js';
import { ExampleBrowser } from './components/ExampleBrowser.js';
import { CommandProcessor } from './command/CommandProcessor.js';
import { categorizeMessage } from './repl/MessageFilter.js';
import { ThemeManager } from './components/ThemeManager.js';
import { LMActivityIndicator } from './components/LMActivityIndicator.js';
import { LayoutPresets } from './config/LayoutPresets.js';
import { Logger } from './logging/Logger.js';
import { StatusBar } from './components/StatusBar.js';

console.log('--- SeNARS Unified IDE loading ---');

cytoscape.use(fcose);
window.cytoscape = cytoscape;

class SeNARSIDE {
    constructor() {
        this.layout = null;
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

        if (!this.presetName) this.presetName = 'ide';

        // Map common aliases
        if (this.presetName === 'console') this.presetName = 'repl';
        if (this.presetName === 'online') this.presetName = 'dashboard';
    }

    loadSettings() {
        const saved = localStorage.getItem('senars-ide-settings');
        if (saved) {
            const settings = JSON.parse(saved);
            this.connectionMode = settings.mode || 'local';
            this.serverUrl = settings.serverUrl || 'localhost:3000';
        }
    }

    saveSettings() {
        localStorage.setItem('senars-ide-settings', JSON.stringify({
            mode: this.connectionMode,
            serverUrl: this.serverUrl
        }));
    }

    async initialize() {
        console.log(`Initializing SeNARS IDE (Layout: ${this.presetName})...`);

        this.statusBar = new StatusBar(document.getElementById('status-bar-root'));
        this.statusBar.initialize({ onModeSwitch: () => this.showConnectionModal() });

        this.setupLayout();
        await this.switchMode(this.connectionMode);
        this.setupKeyboardShortcuts();

        // Listen for concept selection (Global Event Bus)
        document.addEventListener('senars:concept:select', (e) => this.handleConceptSelect(e));

        console.log(`SeNARS IDE initialized in ${this.connectionMode} mode`);
    }

    handleConceptSelect(e) {
        const { concept } = e.detail;
        if (concept) {
             // Open Memory Inspector if available
             const memoryComponent = this.layout.root.getItemsByFilter(item => item.config.componentName === 'memoryComponent')[0];
             if (memoryComponent && memoryComponent.parent && memoryComponent.parent.setActiveContentItem) {
                 memoryComponent.parent.setActiveContentItem(memoryComponent);
             }
        }
    }

    setupLayout() {
        const layoutRoot = document.getElementById('layout-root');
        if (!layoutRoot) {
            console.error('Layout root not found');
            return;
        }

        this.layout = new GoldenLayout(layoutRoot);

        // Register Component Factories
        this.layout.registerComponentFactoryFunction('replComponent', (c) => this.createREPLComponent(c));
        this.layout.registerComponentFactoryFunction('graphComponent', (c) => this.createGraphComponent(c));
        this.layout.registerComponentFactoryFunction('memoryComponent', (c) => this.createMemoryComponent(c));
        this.layout.registerComponentFactoryFunction('derivationComponent', (c) => this.createDerivationComponent(c));
        this.layout.registerComponentFactoryFunction('metricsComponent', (c) => this.createMetricsComponent(c));
        this.layout.registerComponentFactoryFunction('settingsComponent', (c) => this.createSettingsComponent(c));
        this.layout.registerComponentFactoryFunction('examplesComponent', (c) => this.createExamplesComponent(c));

        // Load Configuration
        let config = LayoutPresets[this.presetName] || LayoutPresets.ide;

        // Attempt to load user saved state if matches current preset
        const savedState = localStorage.getItem(`senars-layout-${this.presetName}`);
        if (savedState) {
             try {
                 // We could load the saved state, but GoldenLayout state saving can be finicky with component structure changes.
                 // For now, we rely on presets. To enable persistence, uncomment:
                 // config = JSON.parse(savedState);
             } catch(e) { console.warn('Failed to load saved layout', e); }
        }

        this.layout.loadLayout(config);

        // Save state on change
        this.layout.on('stateChanged', () => {
             if (this.layout.isInitialised) {
                 localStorage.setItem(`senars-layout-${this.presetName}`, JSON.stringify(this.layout.toConfig()));
             }
        });

        window.addEventListener('resize', () => this.layout.updateRootSize());
    }

    createREPLComponent(container) {
        const replPanel = new REPLPanel(container.element);
        // Defer initialization until app is ready or pass this
        replPanel.initialize(this);
        this.components.set('repl', replPanel);

        // Hook up stats updates
        this.updateStats();
    }

    createGraphComponent(container) {
        const panel = new GraphPanel(container.element);
        panel.initialize();
        this.components.set('graph', panel);
        this.graphManager = panel.graphManager;

        if (this.commandProcessor) this.commandProcessor.graphManager = this.graphManager;

        // Initialize LM Activity Indicator on Graph Container
        if (panel.container) {
            this.lmActivityIndicator = new LMActivityIndicator(panel.container);
        }

        container.on('resize', () => panel.resize());
    }

    createMemoryComponent(container) {
        const panel = new MemoryInspector(container.element);
        panel.initialize();
        this.components.set('memory', panel);
    }

    createDerivationComponent(container) {
        const panel = new DerivationTree(container.element);
        panel.initialize();
        this.components.set('derivation', panel);
        container.on('resize', () => panel.resize?.());
    }

    createMetricsComponent(container) {
        const panel = new SystemMetricsPanel(container.element);
        panel.render();
        this.components.set('metrics', panel);
    }

    createSettingsComponent(container) {
        import('./components/SettingsPanel.js').then(({ SettingsPanel }) => {
            const panel = new SettingsPanel(container.element);
            panel.app = this;
            panel.initialize();
            this.components.set('settings', panel);
        });
    }

    createExamplesComponent(container) {
         // Create a unique container ID
         const id = 'example-browser-' + Math.random().toString(36).substr(2, 9);
         container.element.id = id;
         const panel = new ExampleBrowser(id, {
             onSelect: (node) => {
                 if (node.type === 'file') {
                     // Pass to REPL
                     this.getNotebook()?.loadDemoFile(node.path);
                 }
             }
         });
         panel.initialize();
         this.components.set('examples', panel);
    }

    getNotebook() {
        return this.components.get('repl')?.notebookManager;
    }

    async switchMode(mode) {
        console.log(`Switching to ${mode} mode...`);
        this.connection?.disconnect();
        this.connectionMode = mode;

        const manager = mode === 'local' ? new LocalConnectionManager() : new WebSocketManager();
        this.connection = new ConnectionManager(manager);

        await this.connection.connect(mode === 'remote' ? this.serverUrl : undefined);

        this.connection.subscribe('*', (message) => this.handleMessage(message));
        this.connection.subscribe('connection.status', (status) => this.statusBar?.updateStatus(status));

        // Update CommandProcessor with new connection
        if (this.commandProcessor) {
            this.commandProcessor.connection = this.connection;
        } else {
            // Check if we have a repl panel to hook logger
            this.commandProcessor = new CommandProcessor(this.connection, this.logger, this.graphManager);
            // Wait, CommandProcessor expects (connection, logger). REPLPanel hooks into this.logger.
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

    handleMessage(message) {
        // Core handling logic from SeNARSUI.js + main-ide.js
        this.messageCount++;
        this.updateStats();

        // 1. LM Activities
        if (message.type === 'lm:prompt:start') this.lmActivityIndicator?.show();
        if (message.type === 'lm:prompt:complete') this.lmActivityIndicator?.hide();
        if (message.type === 'lm:error') this.lmActivityIndicator?.showError(message.payload?.error);

        // 2. Notebook / REPL Handling
        const notebook = this.getNotebook();
        if (notebook) {
            if (message.type === 'visualization') {
                const { type, data, content } = message.payload;
                if (type === 'markdown') {
                    notebook.createMarkdownCell(content || data);
                } else if (type === 'graph' || type === 'chart') {
                     const widgetType = type === 'graph' ? 'GraphWidget' : 'ChartWidget';
                     notebook.createWidgetCell(widgetType, data);
                }
            } else if (message.type === 'ui-command') {
                const { command, args } = message.payload;
                const fullCommand = `/${command} ${args}`;
                this.logger.log(`System requested UI Command: ${fullCommand}`, 'system');
                this.commandProcessor?.processCommand(fullCommand, true);
            } else if (message.type === 'agent/prompt') {
                const { question, id } = message.payload;
                notebook.createPromptCell(question, (response) => {
                     this.connection?.sendMessage('agent/response', { id, response });
                });
            } else {
                // Default logging is handled by Logger -> REPLPanel adapter via this.logger
                // But we need to feed the logger if the message is NOT handled there?
                // Actually, ConnectionManager subscriptions are one way.
                // SeNARSUI.js handled generic messages by categorizeMessage and logging.

                // If message is generic result/thought, Logger adapter in REPLPanel handles it
                // IF we log it.

                // Let's explicitly log specific types that should appear in REPL
                const logTypes = ['agent/result', 'agent/thought', 'error', 'system', 'reasoning'];
                // Or use categorizeMessage
                const category = categorizeMessage(message);
                if (category !== 'unknown' && category !== 'concept' && category !== 'task' && category !== 'metrics') {
                     // Check if it's already handled by specific logic
                     // For now, we rely on REPLPanel's adapter. We just need to call this.logger.addLogEntry
                     // But wait, the message comes from connection.

                     let content = message.payload?.result || message.content || JSON.stringify(message.payload);
                     // Avoid double logging if CommandProcessor already logged it (usually it logs inputs)

                     // We can use a direct approach:
                     // notebook.createResultCell(content, category, ...);
                }
            }
        }

        // 3. Components Updates
        try {
            const graphComp = this.components.get('graph');
            // Handle specific graph events from SeNARSUI
            if (message.type === 'reasoning:concept') graphComp?.graphManager?.updateGraph(message);
            if (message.type === 'memory:focus:promote') graphComp?.graphManager?.animateGlow(message.payload?.id || message.payload?.nodeId, 1.0);
            if (message.type === 'concept.created') graphComp?.graphManager?.animateFadeIn(message.payload?.id);
            // Generic update
            graphComp?.update(message);

            const memComp = this.components.get('memory');
            if (message.type === 'memorySnapshot') memComp?.update(message.payload);

            const derComp = this.components.get('derivation');
            if (message.type === 'reasoning:derivation') {
                derComp?.addDerivation(message.payload);
                // Also update graph if needed (SeNARSUI did both)
                graphComp?.graphManager?.handleDerivation?.(message);
            }

            const metricsComp = this.components.get('metrics');
            if (message.type === 'metrics:update' || message.type === 'metrics.updated') {
                metricsComp?.update(message.payload);
            }

            if (message.payload?.cycle) {
                this.cycleCount = message.payload.cycle;
                this.updateStats();
            }

        } catch (e) {
            console.error('Error updating components:', e);
        }
    }

    updateStats() {
        // Update REPL Input stats if available
        const repl = this.components.get('repl');
        repl?.replInput?.updateCycles(this.cycleCount);

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
                this.showDemoLibrary();
            }
        });
    }

    showDemoLibrary() {
        // Use ExampleBrowser in modal
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 1000; display: flex;
            align-items: center; justify-content: center;
        `;

        const modalContainer = document.createElement('div');
        modalContainer.id = 'demo-library-modal';
        modalContainer.style.cssText = `
            width: 900px; max-width: 90vw; height: 80vh; background: #1e1e1e;
            border: 1px solid #3c3c3c; border-radius: 8px; overflow: hidden;
            display: flex; flex-direction: column;
        `;

        // Title Bar
        const header = document.createElement('div');
        header.style.cssText = 'padding: 10px 15px; background: #252526; border-bottom: 1px solid #3c3c3c; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = '<span style="font-weight: bold; color: #d4d4d4;">📚 Demo Library</span>';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background: transparent; border: none; color: #aaa; cursor: pointer; font-size: 1.2em;';
        closeBtn.onclick = () => document.body.removeChild(backdrop);
        header.appendChild(closeBtn);
        modalContainer.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.id = 'demo-browser-content';
        content.style.cssText = 'flex: 1; overflow: hidden;';
        modalContainer.appendChild(content);

        const browser = new ExampleBrowser('demo-browser-content', {
            viewMode: 'tree', // Default to tree in modal for compactness? Or graph?
            onSelect: async (node) => {
                if (node.type === 'file') {
                    document.body.removeChild(backdrop);
                    try {
                        await this.getNotebook()?.loadDemoFile(node.path, { clearFirst: true, autoRun: true });
                    } catch (error) {
                        this.getNotebook()?.createResultCell(`❌ Error loading demo: ${error.message}`, 'system');
                    }
                }
            }
        });

        backdrop.appendChild(modalContainer);
        document.body.appendChild(backdrop);

        // Initialize after appending to DOM
        browser.initialize();

        backdrop.onclick = (e) => { if (e.target === backdrop) document.body.removeChild(backdrop); };
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(backdrop);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
}

async function start() {
    const ide = new SeNARSIDE();
    await ide.initialize();
    window.SeNARSIDE = ide;
}

window.addEventListener('DOMContentLoaded', start);
