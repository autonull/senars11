import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { GoldenLayout } from 'golden-layout';
import { LocalConnectionManager } from './connection/LocalConnectionManager.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { GraphManager } from './visualization/GraphManager.js';
import { MessageFilter, categorizeMessage } from './repl/MessageFilter.js';
import { NotebookManager } from './repl/NotebookManager.js';
import { FilterToolbar } from './repl/FilterToolbar.js';

console.log('--- SeNARS IDE loading ---');

cytoscape.use(fcose);
window.cytoscape = cytoscape;

/**
 * Unified SeNARS IDE
 * Supports both Local (in-browser) and Remote (WebSocket) modes
 */
class SeNARSIDE {
    constructor() {
        this.layout = null;
        this.connection = null;
        this.connectionMode = 'local'; // 'local' or 'remote'
        this.components = new Map();
        this.graphManager = null;
        this.messageFilter = new MessageFilter();
        this.notebook = null; // Initialized when REPL is created
        this.filterToolbar = null;

        // State
        this.cycleCount = 0;
        this.messageCount = 0;
        this.isRunning = false;

        // Load saved settings
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

        // Set up layout
        this.setupLayout();

        // Initialize connection (starts in local mode by default)
        await this.switchMode(this.connectionMode);

        // Set up keyboard shortcuts
        this.setupKeyboardShortcuts();

        console.log(`SeNARS IDE initialized in ${this.connectionMode} mode`);
    }

    setupLayout() {
        const layoutRoot = document.getElementById('layout-root');
        if (!layoutRoot) {
            console.error('Layout root not found');
            return;
        }

        this.layout = new GoldenLayout(layoutRoot);

        // Register components
        this.layout.registerComponentFactoryFunction('replComponent', (container) => {
            return this.createREPLComponent(container);
        });

        this.layout.registerComponentFactoryFunction('graphComponent', (container) => {
            return this.createGraphComponent(container);
        });

        this.layout.registerComponentFactoryFunction('memoryComponent', (container) => {
            return this.createMemoryComponent(container);
        });

        this.layout.registerComponentFactoryFunction('derivationComponent', (container) => {
            return this.createDerivationComponent(container);
        });

        // Define layout configuration
        const layoutConfig = {
            settings: {
                hasHeaders: true,
                constrainDragToContainer: true,
                reorderEnabled: true,
                selectionEnabled: false,
                showPopoutIcon: false,
                showMaximiseIcon: true,
                showCloseIcon: false
            },
            dimensions: {
                borderWidth: 2,
                minItemHeight: 100,
                minItemWidth: 200,
                headerHeight: 24
            },
            root: {
                type: 'row',
                content: [
                    {
                        type: 'component',
                        componentName: 'replComponent',
                        title: 'REPL',
                        width: 60
                    },
                    {
                        type: 'stack',
                        width: 40,
                        content: [
                            {
                                type: 'component',
                                componentName: 'graphComponent',
                                title: 'KNOWLEDGE GRAPH',
                                isClosable: false
                            },
                            {
                                type: 'component',
                                componentName: 'memoryComponent',
                                title: 'MEMORY INSPECTOR'
                            },
                            {
                                type: 'component',
                                componentName: 'derivationComponent',
                                title: 'DERIVATION TRACER'
                            }
                        ]
                    }
                ]
            }
        };

        this.layout.loadLayout(layoutConfig);

        // Handle window resize
        window.addEventListener('resize', () => {
            this.layout.updateRootSize();
        });
    }

    createREPLComponent(container) {
        const replContainer = container.element;
        replContainer.style.display = 'flex';
        replContainer.style.flexDirection = 'column';
        replContainer.style.height = '100%';
        replContainer.style.backgroundColor = '#1e1e1e';
        replContainer.style.color = '#d4d4d4';

        // Connection status bar
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
        stats.style.fontSize = '0.9em';
        stats.style.color = '#888';

        statusBar.appendChild(modeIndicator);
        statusBar.appendChild(stats);
        replContainer.appendChild(statusBar);

        // Filter toolbar
        this.filterToolbar = new FilterToolbar(
            this.messageFilter,
            {
                onFilterChange: () => this.filterMessages(),
                onExport: () => this.exportLogs()
            }
        );
        replContainer.appendChild(this.filterToolbar.render());

        // Notebook container (cells go here)
        const notebookContainer = document.createElement('div');
        notebookContainer.id = 'repl-notebook';
        notebookContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px;';
        replContainer.appendChild(notebookContainer);

        // Initialize notebook manager
        this.notebook = new NotebookManager(notebookContainer);

        // Input area
        const inputArea = document.createElement('div');
        inputArea.style.cssText = 'padding: 10px; background: #252526; border-top: 1px solid #333;';

        const inputBox = document.createElement('textarea');
        inputBox.id = 'repl-input';
        inputBox.placeholder = 'Enter Narsese or MeTTa...';
        inputBox.rows = 3;
        inputBox.style.cssText = 'width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3c3c3c; padding: 8px; font-family: monospace; resize: vertical;';

        inputBox.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.executeInput();
            }
        });

        const buttonBar = document.createElement('div');
        buttonBar.style.cssText = 'display: flex; gap: 8px; margin-top: 8px; align-items: center;';

        // Reasoner controls
        const reasonerControls = document.createElement('div');
        reasonerControls.style.cssText = 'display: flex; gap: 4px; margin-right: 12px; padding-right: 12px; border-right: 1px solid #444;';

        const createControlBtn = (icon, title, action, bg = '#333', color = 'white') => {
            const btn = document.createElement('button');
            btn.innerHTML = icon;
            btn.title = title;
            btn.onclick = () => this.controlReasoner(action);
            btn.style.cssText = `padding: 6px 10px; background: ${bg}; color: ${color}; border: none; cursor: pointer; border-radius: 3px;`;
            return btn;
        };

        reasonerControls.append(
            createControlBtn('▶️', 'Start reasoner', 'start', '#0e639c'),
            createControlBtn('⏸️', 'Pause reasoner', 'pause'),
            createControlBtn('⏹️', 'Stop reasoner', 'stop', '#b30000'),
            createControlBtn('⏭️', 'Step reasoner', 'step'),
            createControlBtn('🔄', 'Reset reasoner', 'reset')
        );

        // Input controls
        const runButton = document.createElement('button');
        runButton.textContent = '▶️ Run (Ctrl+Enter)';
        runButton.onclick = () => this.executeInput();
        runButton.style.cssText = 'padding: 6px 12px; background: #0e639c; color: white; border: none; cursor: pointer; border-radius: 3px;';

        const clearButton = document.createElement('button');
        clearButton.textContent = '🗑️ Clear';
        clearButton.onclick = () => this.clearREPL();
        clearButton.style.cssText = 'padding: 6px 12px; background: #333; color: white; border: none; cursor: pointer; border-radius: 3px;';

        buttonBar.appendChild(reasonerControls);
        buttonBar.appendChild(runButton);
        buttonBar.appendChild(clearButton);

        inputArea.appendChild(inputBox);
        inputArea.appendChild(buttonBar);
        replContainer.appendChild(inputArea);

        this.components.set('repl', {
            container: replContainer,
            notebook: notebookContainer,
            input: inputBox,
            modeIndicator,
            cycleCount: document.getElementById('cycle-count'),
            messageCount: document.getElementById('message-count')
        });
    }

    createGraphComponent(container) {
        const graphContainer = container.element;
        graphContainer.style.backgroundColor = '#1e1e1e';
        graphContainer.innerHTML = '<div style="padding: 20px; color: #888;">Knowledge Graph (Coming soon)</div>';

        this.components.set('graph', { container: graphContainer });
    }

    createMemoryComponent(container) {
        const memoryContainer = container.element;
        memoryContainer.style.backgroundColor = '#1e1e1e';
        memoryContainer.innerHTML = '<div style="padding: 20px; color: #888;">Memory Inspector (Coming soon)</div>';

        this.components.set('memory', { container: memoryContainer });
    }

    createDerivationComponent(container) {
        const derivationContainer = container.element;
        derivationContainer.style.backgroundColor = '#1e1e1e';
        derivationContainer.innerHTML = '<div style="padding: 20px; color: #888;">Derivation Tracer (Coming soon)</div>';

        this.components.set('derivation', { container: derivationContainer });
    }

    async switchMode(mode) {
        console.log(`Switching to ${mode} mode...`);

        // Disconnect existing connection
        if (this.connection) {
            this.connection.disconnect();
        }

        this.connectionMode = mode;

        if (mode === 'local') {
            // Local mode: in-browser NAR
            const localManager = new LocalConnectionManager();
            this.connection = new ConnectionManager(localManager);
            await this.connection.connect();
        } else {
            // Remote mode: WebSocket
            const wsManager = new WebSocketManager();
            this.connection = new ConnectionManager(wsManager);
            await this.connection.connect();
        }

        // Set up message handlers
        this.connection.subscribe('*', (message) => this.handleMessage(message));

        // Update UI
        this.updateModeIndicator();
        this.saveSettings();

        // Add welcome message
        if (this.notebook) {
            this.notebook.createResultCell(`🚀 Connected in ${mode} mode`, 'system');
        }
    }

    updateModeIndicator() {
        const repl = this.components.get('repl');
        if (!repl) return;

        const icon = this.connectionMode === 'local' ? '💻' : '🌐';
        const label = this.connectionMode === 'local' ? 'Local Mode' : 'Remote Mode';
        repl.modeIndicator.innerHTML = `<span style="cursor: pointer;" title="Click to switch mode">${icon} ${label}</span>`;
    }

    showConnectionModal() {
        const switchTo = this.connectionMode === 'local' ? 'remote' : 'local';
        if (confirm(`Switch to ${switchTo} mode?`)) {
            this.switchMode(switchTo);
        }
    }

    handleMessage(message) {
        console.log('Received message:', message);

        this.messageCount++;
        this.updateStats();

        // Create result cell
        if (this.notebook) {
            const category = categorizeMessage(message);
            const content = message.payload?.result || message.content || JSON.stringify(message.payload);
            const viewMode = this.messageFilter.getMessageViewMode(message);
            this.notebook.createResultCell(content, category, viewMode);
        }

        // Update cycle count
        if (message.payload?.cycle) {
            this.cycleCount = message.payload.cycle;
            this.updateStats();
        }
    }

    filterMessages() {
        this.notebook?.applyFilter(this.messageFilter);
    }

    exportLogs() {
        if (!this.notebook) return;
        const data = this.notebook.exportNotebook();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `senars-logs-${new Date().toISOString().replace(/:/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    executeInput() {
        const repl = this.components.get('repl');
        if (!repl || !this.notebook) return;

        const input = repl.input.value.trim();
        if (!input) return;

        // Create and execute a code cell
        const codeCell = this.notebook.createCodeCell(input, (content) => {
            if (this.connection?.isConnected()) {
                this.connection.sendMessage('agent/input', { text: content });
            }
        });
        codeCell.execute();

        // Clear input
        repl.input.value = '';
    }

    clearREPL() {
        if (this.notebook) {
            this.notebook.clear();
        }
    }

    controlReasoner(action) {
        console.log('Reasoner control:', action);

        if (!this.connection?.isConnected()) {
            if (this.notebook) {
                this.notebook.createResultCell('⚠️ Not connected', 'system');
            }
            return;
        }

        // Send control command
        this.connection.sendMessage(`control/${action}`, {});

        // Visual feedback
        if (this.notebook) {
            this.notebook.createResultCell(`🎛️ Reasoner ${action}`, 'system');
        }

        // Update state
        this.isRunning = action === 'start';
        if (action === 'stop' || action === 'pause') this.isRunning = false;
        if (action === 'reset') {
            this.cycleCount = 0;
            this.messageCount = 0;
            this.updateStats();
        }
    }

    updateStats() {
        const repl = this.components.get('repl');
        if (!repl) return;

        if (repl.cycleCount) {
            repl.cycleCount.textContent = this.cycleCount;
        }
        if (repl.messageCount) {
            repl.messageCount.textContent = this.messageCount;
        }
    }



    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter: Execute (handled in input box)
            // Ctrl+L: Clear REPL
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.clearREPL();
            }
        });
    }
}

// Initialize on DOM loaded
async function start() {
    const ide = new SeNARSIDE();
    await ide.initialize();

    // Expose for debugging
    window.SeNARSIDE = ide;
}

window.addEventListener('DOMContentLoaded', start);
