import { Component } from './Component.js';
import { NotebookManager } from '../notebook/NotebookManager.js';
import { NotebookInput } from '../notebook/NotebookInput.js';
import { MessageFilter } from '../notebook/MessageFilter.js';
import { FilterToolbar } from '../notebook/FilterToolbar.js';

export class NotebookPanel extends Component {
    constructor(container) {
        super(container);
        this.notebookManager = null;
        this.notebookInput = null;
        this.messageFilter = new MessageFilter();
        this.filterToolbar = null;
        this.app = null;
    }

    initialize(app) {
        this.app = app;
        this.render();
        this.setupLoggerAdapter();
        this.setupEventListeners();
        console.log('NotebookPanel initialized');
    }

    setupEventListeners() {
        document.addEventListener('senars:notebook:add-cell', (e) => {
            const { type, content } = e.detail;
            if (type === 'code') this.notebookManager.createCodeCell(content);
            else if (type === 'markdown') this.notebookManager.createMarkdownCell(content);
        });
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.className = 'notebook-panel-container';

        // 1. Toolbar
        const toolbarContainer = document.createElement('div');
        this.filterToolbar = new FilterToolbar(this.messageFilter, {
            onFilterChange: () => this.notebookManager.applyFilter(this.messageFilter),
            onExport: () => this.exportNotebook(),
            onImport: (file) => this.importNotebookFile(file),
            onRunAll: () => this.notebookManager.runAll(),
            onClearOutputs: () => this.notebookManager.clearOutputs(),
            onViewChange: (mode) => this.notebookManager.switchView(mode)
        });

        toolbarContainer.appendChild(this.filterToolbar.render());
        this.container.appendChild(toolbarContainer);

        // 2. Notebook Container
        const notebookContainer = document.createElement('div');
        notebookContainer.className = 'notebook-container';
        this.container.appendChild(notebookContainer);

        this.notebookManager = new NotebookManager(notebookContainer);
        this.notebookManager.loadFromStorage();

        // 3. Input Area
        const inputContainer = document.createElement('div');
        this.notebookInput = new NotebookInput(inputContainer, {
            onExecute: (cmd) => this.handleExecution(cmd),
            onClear: () => this.notebookManager.clear(),
            onDemo: () => this.showDemoSelector(),
            onExtraAction: (action) => this.handleExtraAction(action),
            onControl: (action) => this.controlReasoner(action)
        });
        this.notebookInput.render();
        this.container.appendChild(inputContainer);
    }

    handleExecution(command) {
        const cell = this.notebookManager.createCodeCell(command);
        cell.isEditing = false;
        cell.updateMode();

        if (this.app?.commandProcessor) {
            this.app.commandProcessor.processCommand(command);
        } else {
            console.warn('Command Processor not available');
            this.notebookManager.createResultCell('Command Processor not connected', 'system');
        }
    }

    controlReasoner(action) {
        if (!this.app?.connection) return;

        if (!this.app.connection.isConnected()) {
            this.notebookManager.createResultCell('⚠️ Not connected', 'system');
            return;
        }

        this.app.connection.sendMessage(`control/${action}`, {});
        this.notebookManager.createResultCell(`🎛️ Reasoner ${action}`, 'system');

        const stateActions = {
            start: () => { this.app.isRunning = true; },
            stop: () => { this.app.isRunning = false; },
            pause: () => { this.app.isRunning = false; },
            reset: () => {
                this.app.cycleCount = 0;
                this.app.messageCount = 0;
            }
        };

        stateActions[action]?.();

        this.notebookInput.updateState(this.app.isRunning);
        this.app.updateStats();
    }

    handleExtraAction(action) {
        const actions = {
            markdown: () => this.notebookManager.createMarkdownCell('Double click to edit...'),
            graph: () => this.notebookManager.createWidgetCell('GraphWidget', { nodes: [], edges: [] }),
            slider: () => this.notebookManager.createWidgetCell('TruthSlider', { frequency: 0.5, confidence: 0.9 }),
            subnotebook: () => this.notebookManager.createWidgetCell('SubNotebook', {})
        };

        actions[action]?.();
    }

    showDemoSelector() {
        import('./DemoLibraryModal.js').then(({ DemoLibraryModal }) => {
            new DemoLibraryModal(this.notebookManager).show();
        });
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

    importNotebookFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.notebookManager.importNotebook(data);
            } catch (err) {
                console.error('Failed to import notebook', err);
            }
        };
        reader.readAsText(file);
    }

    setupLoggerAdapter() {
        if (!this.app?.logger) return;

        const categoryMap = {
            result: 'result',
            thought: 'reasoning',
            debug: 'debug',
            error: 'system',
            warning: 'system',
            info: 'system',
            input: 'user-input',
            metric: 'metric'
        };

        const adapter = {
            addLog: (content, type) => {
                let category = categoryMap[type] || 'system';
                if (type.includes('reasoning') || type.includes('inference')) category = 'reasoning';

                const viewMode = this.messageFilter.getCategoryMode(category);
                this.notebookManager.createResultCell(content, category, viewMode);
                return true;
            },
            logMarkdown: (content) => {
                this.notebookManager.createMarkdownCell(content);
            },
            logWidget: (type, data) => {
                const widgetType = type === 'graph' ? 'GraphWidget' : type;
                this.notebookManager.createWidgetCell(widgetType, data);
            },
            clear: () => this.notebookManager.clear(),
            messageCounter: 0,
            icons: this.app.logger.icons || {}
        };

        this.app.logger.logViewer = adapter;
        console.log('Logger adapter installed in NotebookPanel');
    }
}
