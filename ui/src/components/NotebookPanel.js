import { Component } from './Component.js';
import { NotebookManager } from '../notebook/NotebookManager.js';
import { NotebookInput } from '../notebook/NotebookInput.js';
import { MessageFilter } from '../notebook/MessageFilter.js';
import { FilterToolbar } from '../notebook/FilterToolbar.js';
import { EVENTS } from '../config/constants.js';
import { FluentUI } from '../utils/FluentUI.js';
import { eventBus } from '../core/EventBus.js';

export class NotebookPanel extends Component {
    constructor(container, options = {}) {
        super(container);
        this.options = options;
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
        eventBus.on('notebook:cmd:add-cell', ({ type, content }) => {
            if (type === 'code') this.notebookManager.createCodeCell(content);
            else if (type === 'markdown') this.notebookManager.createMarkdownCell(content);
        });

        document.addEventListener(EVENTS.NOTEBOOK_ADD_CELL, (e) => {
            const { type, content } = e.detail;
            eventBus.emit('notebook:cmd:add-cell', { type, content });
        });
    }

    render() {
        if (!this.container) return;

        this.fluent().clear().class('notebook-panel-container');

        this.filterToolbar = new FilterToolbar(this.messageFilter, {
            onFilterChange: () => this.notebookManager.applyFilter(this.messageFilter),
            onExport: () => this.exportNotebook(),
            onImport: (file) => this.importNotebookFile(file),
            onRunAll: () => this.notebookManager.runAll(),
            onClearOutputs: () => this.notebookManager.clearOutputs(),
            onViewChange: (mode) => this.notebookManager.switchView(mode),
            onReset: () => this.controlReasoner('reset'),
            onUndo: () => this.notebookManager.undo()
        });

        FluentUI.create('div').child(this.filterToolbar.render()).mount(this.container);

        const notebookContainer = FluentUI.create('div')
            .class('notebook-container')
            .mount(this.container);

        this.notebookManager = new NotebookManager(notebookContainer.dom, {
            onExecute: (cmd, originCell) => this.handleExecution(cmd, originCell)
        });
        this.notebookManager.loadFromStorage();

        if (!this.options.hideInput) {
            const inputContainer = FluentUI.create('div').mount(this.container);

            this.notebookInput = new NotebookInput(inputContainer.dom, {
                onExecute: (cmd) => this.handleExecution(cmd),
                onClear: () => this.notebookManager.clear(),
                onDemo: () => this.showDemoSelector(),
                onExtraAction: (action) => this.handleExtraAction(action),
                onControl: (action) => this.controlReasoner(action)
            });
            this.notebookInput.render();
        }
    }

    handleExecution(command, originCell) {
        if (!originCell) {
            const cell = this.notebookManager.createCodeCell(command);
            cell.isEditing = false;
            cell.updateMode();
            this.notebookManager.lastInsertionPoint = cell;
        }

        if (this.app?.commandProcessor) {
            this.app.commandProcessor.processCommand(command);
        } else {
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

        this.notebookInput?.updateState(this.app.isRunning);
        this.app.updateStats();
    }

    handleExtraAction(action) {
        const actions = {
            markdown: () => this.notebookManager.createMarkdownCell('Double click to edit...'),
            graph: () => this.notebookManager.createWidgetCell('GraphWidget', { nodes: [], edges: [] }),
            tasktree: () => this.notebookManager.createWidgetCell('TaskTreeWidget', { label: 'Root Goal', type: 'goal', children: [{ label: 'Subgoal 1', type: 'op' }, { label: 'Subgoal 2', type: 'op' }] }),
            slider: () => this.notebookManager.createWidgetCell('TruthSlider', { frequency: 0.5, confidence: 0.9 }),
            subnotebook: () => this.notebookManager.createWidgetCell('SubNotebook', {}),
            timeline: () => this.notebookManager.createWidgetCell('TimelineWidget', { events: [] }),
            variables: () => this.notebookManager.createWidgetCell('VariableInspector', { bindings: {} })
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

        this.app.logger.logViewer = {
            addLog: (content, type) => {
                let category = categoryMap[type] || 'system';
                if (type.includes('reasoning') || type.includes('inference')) category = 'reasoning';

                const viewMode = this.messageFilter.getCategoryMode(category);
                this.notebookManager.createResultCell(content, category, viewMode);
                return true;
            },
            logMarkdown: (content) => this.notebookManager.createMarkdownCell(content),
            logWidget: (type, data) => {
                const widgetType = type === 'graph' ? 'GraphWidget' : type;
                this.notebookManager.createWidgetCell(widgetType, data);
            },
            clear: () => this.notebookManager.clear(),
            messageCounter: 0,
            icons: this.app.logger.icons || {}
        };
    }
}
