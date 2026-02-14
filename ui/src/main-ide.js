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
import { CommandProcessor } from './command/CommandProcessor.js';
import { MessageFilter, categorizeMessage } from './repl/MessageFilter.js';
import { NotebookManager } from './repl/NotebookManager.js';
import { NotebookLogger } from './repl/NotebookLogger.js';
import { FilterToolbar } from './repl/FilterToolbar.js';
import { REPLInput } from './repl/REPLInput.js';
import { DemoLibrary } from './components/DemoLibrary.js';

console.log('--- SeNARS IDE loading ---');

cytoscape.use(fcose);
window.cytoscape = cytoscape;

class SeNARSIDE {
    constructor() {
        this.layout = null;
        this.connection = null;
        this.connectionMode = 'local';
        this.components = new Map();
        this.graphManager = null;
        this.messageFilter = new MessageFilter();
        this.notebook = null;
        this.notebookLogger = null;
        this.commandProcessor = null;
        this.filterToolbar = null;
        this.cycleCount = 0;
        this.messageCount = 0;
        this.isRunning = false;
        this.loadSettings();
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
        console.log('Initializing SeNARS IDE...');
        this.setupLayout();
        await this.switchMode(this.connectionMode);
        this.setupKeyboardShortcuts();

        // Load persisted state or show welcome
        if (this.notebook && !this.notebook.loadFromStorage()) {
            this.notebook.createMarkdownCell("# Welcome to SeNARS IDE v1.0\n\nDouble-click this cell to edit.\n- **Local Mode**: Runs entirely in browser\n- **Remote Mode**: Connects to backend\n- **Widgets**: Interactive tools");
        }

        // Listen for concept selection to log in REPL
        document.addEventListener('senars:concept:select', (e) => {
            const { concept } = e.detail;
            if (concept) {
                this.notebook?.createResultCell(concept, 'concept', 'compact');
            }
        });

        console.log(`SeNARS IDE initialized in ${this.connectionMode} mode`);
    }

    setupLayout() {
        const layoutRoot = document.getElementById('layout-root');
        if (!layoutRoot) {
            console.error('Layout root not found');
            return;
        }

        this.layout = new GoldenLayout(layoutRoot);

        const factories = {
            'replComponent': (c) => this.createREPLComponent(c),
            'graphComponent': (c) => this.createGraphComponent(c),
            'memoryComponent': (c) => this.createMemoryComponent(c),
            'derivationComponent': (c) => this.createDerivationComponent(c),
            'metricsComponent': (c) => this.createMetricsComponent(c)
        };

        Object.entries(factories).forEach(([k, v]) => this.layout.registerComponentFactoryFunction(k, v));

        this.layout.loadLayout({
            settings: { hasHeaders: true, constrainDragToContainer: true, reorderEnabled: true, selectionEnabled: false, showPopoutIcon: false, showMaximiseIcon: true, showCloseIcon: false },
            dimensions: { borderWidth: 2, minItemHeight: 100, minItemWidth: 200, headerHeight: 24 },
            root: {
                type: 'row',
                content: [
                    { type: 'component', componentName: 'replComponent', title: 'REPL', width: 70 },
                    {
                        type: 'stack', width: 30,
                        isClosable: true,
                        content: [
                            { type: 'component', componentName: 'graphComponent', title: 'KNOWLEDGE GRAPH', isClosable: true },
                            { type: 'component', componentName: 'memoryComponent', title: 'MEMORY INSPECTOR' },
                            { type: 'component', componentName: 'derivationComponent', title: 'DERIVATION TRACER' },
                            { type: 'component', componentName: 'metricsComponent', title: 'SYSTEM METRICS' }
                        ]
                    }
                ]
            }
        });

        window.addEventListener('resize', () => this.layout.updateRootSize());
    }

    createREPLComponent(container) {
        const replContainer = container.element;
        Object.assign(replContainer.style, { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e', color: '#d4d4d4' });

        const statusBar = document.createElement('div');
        statusBar.className = 'connection-status-bar';
        statusBar.style.cssText = 'padding: 8px; background: #252526; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;';

        const modeIndicator = document.createElement('div');
        modeIndicator.id = 'mode-indicator';
        modeIndicator.innerHTML = `<span style="cursor: pointer;" title="Click to switch mode">💻 Local Mode</span>`;
        modeIndicator.onclick = () => this.showConnectionModal();

        const stats = document.createElement('div');
        stats.id = 'connection-stats';
        stats.innerHTML = 'Cycles: <span id="cycle-count">0</span> | Messages: <span id="message-count">0</span>';
        Object.assign(stats.style, { fontSize: '0.9em', color: '#888' });

        statusBar.append(modeIndicator, stats);
        replContainer.appendChild(statusBar);

        this.filterToolbar = new FilterToolbar(this.messageFilter, {
            onFilterChange: () => this.filterMessages(),
            onExport: () => this.exportLogs(),
            onImport: (file) => this.importLogs(file),
            onRunAll: () => this.notebook?.runAll(),
            onClearOutputs: () => this.notebook?.clearOutputs(),
            onViewChange: (mode) => this.notebook?.switchView(mode)
        });
        replContainer.appendChild(this.filterToolbar.render());

        const notebookContainer = document.createElement('div');
        notebookContainer.id = 'repl-notebook';
        notebookContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px;';
        replContainer.appendChild(notebookContainer);

        this.notebook = new NotebookManager(notebookContainer, {
            onExecute: (text) => this.processCellExecution(text)
        });
        this.notebookLogger = new NotebookLogger(this.notebook);

        const inputContainer = document.createElement('div');
        replContainer.appendChild(inputContainer);

        this.replInput = new REPLInput(inputContainer, {
            onExecute: (text) => this.executeInput(text),
            onClear: () => this.clearREPL(),
            onDemo: () => this.showDemoLibrary(),
            onExtraAction: (action) => this.handleExtraAction(action),
            onControl: (action) => this.controlReasoner(action)
        });
        this.replInput.render();

        this.components.set('repl', {
            container: replContainer,
            notebook: notebookContainer,
            input: this.replInput,
            modeIndicator,
            messageCount: document.getElementById('message-count')
        });
    }

    createGraphComponent(container) {
        const graphContainer = container.element;
        graphContainer.style.backgroundColor = '#1e1e1e';
        graphContainer.innerHTML = '';

        const panel = new GraphPanel(graphContainer);
        panel.initialize();
        this.components.set('graph', { container: graphContainer, panel });
        this.graphManager = panel.graphManager;
        if (this.commandProcessor) this.commandProcessor.graphManager = this.graphManager;

        container.on('resize', () => {
            panel.graphManager?.cy && (panel.graphManager.cy.resize(), panel.graphManager.cy.fit());
        });
    }

    createMemoryComponent(container) {
        const memoryContainer = container.element;
        memoryContainer.style.backgroundColor = '#1e1e1e';
        memoryContainer.innerHTML = '';
        const panel = new MemoryInspector(memoryContainer);
        panel.initialize();
        this.components.set('memory', { container: memoryContainer, panel });
    }

    createDerivationComponent(container) {
        const derivationContainer = container.element;
        derivationContainer.style.backgroundColor = '#1e1e1e';
        derivationContainer.innerHTML = '';
        const panel = new DerivationTree(derivationContainer);
        panel.initialize();
        this.components.set('derivation', { container: derivationContainer, panel });
        container.on('resize', () => panel.resize?.());
    }

    createMetricsComponent(container) {
        const metricsContainer = container.element;
        metricsContainer.style.backgroundColor = '#1e1e1e';
        metricsContainer.innerHTML = '';
        const panel = new SystemMetricsPanel(metricsContainer);
        panel.render();
        this.components.set('metrics', { container: metricsContainer, panel });
    }

    async switchMode(mode) {
        console.log(`Switching to ${mode} mode...`);
        this.connection?.disconnect();
        this.connectionMode = mode;

        const manager = mode === 'local' ? new LocalConnectionManager() : new WebSocketManager();
        this.connection = new ConnectionManager(manager);
        await this.connection.connect(mode === 'remote' ? this.serverUrl : undefined);

        this.connection.subscribe('*', (message) => this.handleMessage(message));

        // Update CommandProcessor with new connection
        if (this.commandProcessor) {
            this.commandProcessor.connection = this.connection;
        } else {
            this.commandProcessor = new CommandProcessor(this.connection, this.notebookLogger, this.graphManager);
            this.commandProcessor.setLayout(this.layout);
        }

        this.updateModeIndicator();
        this.saveSettings();
        this.notebook?.createResultCell(`🚀 Connected in ${mode} mode`, 'system');
    }

    updateModeIndicator() {
        const repl = this.components.get('repl');
        if (!repl) return;
        const icon = this.connectionMode === 'local' ? '💻' : '🌐';
        const label = this.connectionMode === 'local' ? 'Local Mode' : 'Remote Mode';
        repl.modeIndicator.innerHTML = `<span style="cursor: pointer;" title="Click to switch mode">${icon} ${label}</span>`;
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
        console.log('Received message:', message);
        this.messageCount++;
        this.updateStats();

        if (this.notebook) {
            if (message.type === 'visualization') {
                const { type, data, content } = message.payload;
                if (type === 'markdown') {
                    this.notebook.createMarkdownCell(content || data);
                } else if (type === 'graph' || type === 'chart') {
                     // Map type to widget component name
                     const widgetType = type === 'graph' ? 'GraphWidget' : 'ChartWidget';
                     this.notebook.createWidgetCell(widgetType, data);
                }
            } else if (message.type === 'ui-command') {
                const { command, args } = message.payload;
                const fullCommand = `/${command} ${args}`;
                this.notebookLogger.log(`System requested UI Command: ${fullCommand}`, 'system');
                if (this.commandProcessor) {
                    this.commandProcessor.processCommand(fullCommand, true);
                }
            } else if (message.type === 'agent/prompt') {
                // Handle system asking for user input
                const { question, id } = message.payload;
                this.notebook.createPromptCell(question, (response) => {
                     // Send response back
                     if (this.connection) {
                         this.connection.sendMessage('agent/response', { id, response });
                     }
                });
            } else {
                const category = categorizeMessage(message);
                let content;
                if (category === 'concept' || category === 'task') {
                    content = message.payload;
                } else {
                    content = message.payload?.result || message.content || JSON.stringify(message.payload);
                }
                const viewMode = this.messageFilter.getMessageViewMode(message);
                this.notebook.createResultCell(content, category, viewMode);
            }
        }

        if (message.payload?.cycle) {
            this.cycleCount = message.payload.cycle;
            this.updateStats();
        }

        try {
            const graphComp = this.components.get('graph');
            graphComp?.panel?.update(message);

            const memComp = this.components.get('memory');
            if (memComp?.panel && message.type === 'memorySnapshot') memComp.panel.update(message.payload);

            const derComp = this.components.get('derivation');
            if (derComp?.panel && message.type === 'reasoning:derivation') derComp.panel.addDerivation(message.payload);

            const metricsComp = this.components.get('metrics');
            if (metricsComp?.panel && (message.type === 'metrics:update' || message.type === 'metrics.updated')) {
                metricsComp.panel.update(message.payload);
            }
        } catch (e) {
            console.error('Error updating components:', e);
        }
    }

    filterMessages() {
        this.notebook?.applyFilter(this.messageFilter);
    }

    exportLogs() {
        if (!this.notebook) return;
        const data = this.notebook.exportNotebook();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `senars-notebook-${new Date().toISOString().replace(/:/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importLogs(file) {
        if (!this.notebook || !file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.notebook.importNotebook(data);
                this.notebook.createResultCell('📂 Notebook imported successfully', 'system');
            } catch (err) {
                console.error('Import error', err);
                this.notebook.createResultCell(`❌ Import failed: ${err.message}`, 'system');
            }
        };
        reader.readAsText(file);
    }

    processCellExecution(content) {
        // Detect language
        const trimmed = content.trim();
        const isMetta = trimmed.startsWith('(') || trimmed.startsWith(';') || trimmed.startsWith('!');
        const mode = isMetta ? 'metta' : 'narsese';

        if (this.commandProcessor) {
            this.commandProcessor.processCommand(content, false, mode);
        } else if (this.connection?.isConnected()) {
            const type = mode === 'metta' ? 'agent/input' : 'narseseInput';
            this.connection.sendMessage(type, { text: content });
        }
    }

    executeInput(text) {
        if (!text) return;
        this.notebook.createCodeCell(text).execute();
    }

    clearREPL() {
        this.notebook?.clear();
    }

    controlReasoner(action) {
        console.log('Reasoner control:', action);
        if (!this.connection?.isConnected()) {
            this.notebook?.createResultCell('⚠️ Not connected', 'system');
            return;
        }

        this.connection.sendMessage(`control/${action}`, {});
        this.notebook?.createResultCell(`🎛️ Reasoner ${action}`, 'system');

        this.isRunning = action === 'start';
        if (action === 'stop' || action === 'pause') this.isRunning = false;
        if (action === 'reset') {
            this.cycleCount = 0;
            this.messageCount = 0;
        }

        this.replInput?.updateState(this.isRunning);
        this.updateStats();
    }

    updateStats() {
        const repl = this.components.get('repl');
        if (repl) {
            // Update REPLInput toolbar display
            this.replInput?.updateCycles(this.cycleCount);

            // Legacy/Status bar updates
            if (repl.cycleCount) repl.cycleCount.textContent = this.cycleCount;
            if (repl.messageCount) repl.messageCount.textContent = this.messageCount;
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.clearREPL();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.showDemoLibrary();
            }
        });
    }

    handleExtraAction(action) {
        switch (action) {
            case 'markdown':
                this.notebook.createMarkdownCell('Double-click to edit...');
                break;
            case 'graph':
                this.notebook.createWidgetCell('GraphWidget', [
                    { id: 'a', label: 'Concept A' },
                    { id: 'b', label: 'Concept B' },
                    { source: 'a', target: 'b', label: 'relates' }
                ]);
                break;
            case 'slider':
                this.notebook.createWidgetCell('TruthSlider', { frequency: 0.5, confidence: 0.9 });
                break;
            case 'simulation':
                this.runEpicSimulation();
                break;
            case 'subnotebook':
                this.notebook.createWidgetCell('SubNotebook', {});
                break;
        }
    }

    runEpicSimulation() {
        this.notebook.clear();
        this.notebook.createMarkdownCell('# 🚀 System Simulation: Cognitive Load Test\n\nInitiating high-frequency inference simulation...');

        // 1. Add Chart Widget
        const chartCell = this.notebook.createWidgetCell('ChartWidget', {
            type: 'line',
            options: {
                plugins: { title: { display: true, text: 'Real-time Inference Metrics' } }
            }
        });

        // 2. Add Graph Widget
        const graphCell = this.notebook.createWidgetCell('GraphWidget', [
            { id: 'SELF', type: 'concept', val: 100, label: 'SELF' }
        ]);

        // 3. Simulate Activity
        let tick = 0;
        const interval = setInterval(() => {
            tick++;

            // Update Chart
            const val = Math.sin(tick * 0.1) * 20 + 50 + Math.random() * 10;
            // Hack to update: we don't have direct access to widget instance easily
            if (chartCell.widgetInstance) {
                chartCell.widgetInstance.updateData(new Date().toLocaleTimeString(), val);
            }

            // Update Graph
            if (tick % 5 === 0 && graphCell.widgetInstance) {
                const id = `NODE_${tick}`;
                const source = tick > 5 ? `NODE_${tick-5}` : 'SELF';
                graphCell.widgetInstance.updateData([
                    { group: 'nodes', data: { id, label: `Concept ${tick}`, val: Math.random() * 50 + 10 } },
                    { group: 'edges', data: { source, target: id, label: 'implies' } }
                ]);
            }

            // Log messages
            if (tick % 10 === 0) {
                 this.notebook.createResultCell(`[SIM] Cycle ${tick}: Inference completed with confidence ${(Math.random()).toFixed(2)}`, 'reasoning', 'compact');
            }

            if (tick > 100) clearInterval(interval);
        }, 200);
    }

    showDemoLibrary() {
        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 1000; display: flex;
            align-items: center; justify-content: center;
        `;

        const modalContainer = document.createElement('div');
        modalContainer.style.cssText = `
            width: 900px; max-width: 90vw; height: 80vh; background: #1e1e1e;
            border: 1px solid #3c3c3c; border-radius: 8px; overflow: hidden;
            display: flex; flex-direction: column;
        `;

        const demoLib = new DemoLibrary(modalContainer, async (path, options) => {
            // Close modal
            document.body.removeChild(backdrop);

            // Load demo
            try {
                await this.notebook.loadDemoFile(path, options);
            } catch (error) {
                this.notebook.createResultCell(
                    `❌ Error loading demo: ${error.message}`,
                    'system'
                );
            }
        });

        demoLib.initialize();

        backdrop.appendChild(modalContainer);
        document.body.appendChild(backdrop);

        backdrop.onclick = (e) => {
            if (e.target === backdrop) document.body.removeChild(backdrop);
        };

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
