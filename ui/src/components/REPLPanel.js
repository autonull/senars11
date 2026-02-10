import { Component } from './Component.js';
import { NotebookManager } from '../repl/NotebookManager.js';
import { REPLInput } from '../repl/REPLInput.js';
import { MessageFilter, categorizeMessage } from '../repl/MessageFilter.js';
import { FilterToolbar } from '../repl/FilterToolbar.js';

export class REPLPanel extends Component {
    constructor(container) {
        super(container);
        this.notebookManager = null;
        this.replInput = null;
        this.messageFilter = new MessageFilter();
        this.filterToolbar = null;
        this.app = null;
    }

    initialize(app) {
        this.app = app;
        this.render();
        this.setupLoggerAdapter();

        // Handle external requests to add cells
        document.addEventListener('senars:repl:add-cell', (e) => {
            const { type, content } = e.detail;
            if (type === 'code') this.notebookManager.createCodeCell(content);
            else if (type === 'markdown') this.notebookManager.createMarkdownCell(content);
        });

        console.log('REPLPanel initialized');
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.style.cssText = 'display: flex; flex-direction: column; height: 100%; background: #1e1e1e;';

        // 1. Toolbar (Filter + Tools)
        const toolbarContainer = document.createElement('div');
        this.filterToolbar = new FilterToolbar(this.messageFilter, {
            onFilterChange: () => this.notebookManager.applyFilter(this.messageFilter),
            onExport: () => this.exportNotebook()
        });
        toolbarContainer.appendChild(this.filterToolbar.render());
        this.container.appendChild(toolbarContainer);

        // 2. Notebook Container
        const notebookContainer = document.createElement('div');
        notebookContainer.className = 'notebook-container';
        // Ensure it takes available space and scrolls
        notebookContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px; scroll-behavior: smooth;';
        this.container.appendChild(notebookContainer);

        this.notebookManager = new NotebookManager(notebookContainer);
        // Load previous state?
        this.notebookManager.loadFromStorage();

        // 3. Input Area
        const inputContainer = document.createElement('div');
        this.replInput = new REPLInput(inputContainer, {
            onExecute: (cmd) => this.handleExecution(cmd),
            onClear: () => this.notebookManager.clear(),
            onDemo: () => this.showDemoSelector(),
            onExtraAction: (action) => this.handleExtraAction(action),
            onControl: (action) => this.controlReasoner(action)
        });
        this.replInput.render();
        this.container.appendChild(inputContainer);
    }

    handleExecution(command) {
        // Create code cell first
        const cell = this.notebookManager.createCodeCell(command);
        // Switch to view mode (highlighted) as it is a submitted command
        cell.isEditing = false;
        cell.updateMode();

        // Execute via app command processor
        if (this.app?.commandProcessor) {
            this.app.commandProcessor.processCommand(command);
        } else {
            console.warn('Command Processor not available');
            this.notebookManager.createResultCell('Command Processor not connected', 'system');
        }
    }

    controlReasoner(action) {
        if (!this.app?.connection) return;

        console.log('Reasoner control:', action);
        if (!this.app.connection.isConnected()) {
            this.notebookManager.createResultCell('⚠️ Not connected', 'system');
            return;
        }

        this.app.connection.sendMessage(`control/${action}`, {});
        this.notebookManager.createResultCell(`🎛️ Reasoner ${action}`, 'system');

        // Update state in app
        if (action === 'start') this.app.isRunning = true;
        else if (action === 'stop' || action === 'pause') this.app.isRunning = false;
        else if (action === 'reset') {
            this.app.cycleCount = 0;
            this.app.messageCount = 0;
        }

        // Update UI
        this.replInput.updateState(this.app.isRunning);
        this.app.updateStats(); // Update global stats
    }

    handleExtraAction(action) {
        const actions = {
            markdown: () => this.notebookManager.createMarkdownCell('Double click to edit...'),
            graph: () => this.notebookManager.createWidgetCell('GraphWidget', { nodes: [], edges: [] }),
            slider: () => this.notebookManager.createWidgetCell('TruthSlider', { frequency: 0.5, confidence: 0.9 }),
            subnotebook: () => this.notebookManager.createWidgetCell('SubNotebook', {})
        };

        if (actions[action]) actions[action]();
    }

    showDemoSelector() {
        if (this.app?.showDemoLibrary) {
            this.app.showDemoLibrary();
        } else {
            this.notebookManager.createResultCell('Demo Library not available', 'info');
        }
    }

    exportNotebook() {
        const data = this.notebookManager.exportNotebook();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notebook-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    setupLoggerAdapter() {
        if (!this.app?.logger) return;

        // Adapter to route logs to notebook
        const adapter = {
            addLog: (content, type, icon) => {
                let category = 'system';
                if (type === 'result') category = 'result';
                else if (type === 'thought') category = 'reasoning';
                else if (type === 'debug') category = 'debug';
                else if (['error', 'warning', 'info'].includes(type)) category = 'system';
                else if (type === 'input') category = 'user-input';
                else if (type === 'metric') category = 'metric';
                else if (type.includes('reasoning') || type.includes('inference')) category = 'reasoning';

                const viewMode = this.messageFilter.getCategoryMode(category);
                this.notebookManager.createResultCell(content, category, viewMode);
                return true;
            },
            logMarkdown: (content) => {
                this.notebookManager.createMarkdownCell(content);
            },
            logWidget: (type, data) => {
                // Map widget types if necessary
                const widgetType = type === 'graph' ? 'GraphWidget' : type;
                this.notebookManager.createWidgetCell(widgetType, data);
            },
            clear: () => this.notebookManager.clear(),
            messageCounter: 0,
            icons: this.app.logger.icons || {}
        };

        this.app.logger.logViewer = adapter;
        console.log('Logger adapter installed in REPLPanel');
    }
}
