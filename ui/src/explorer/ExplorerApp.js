import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';
import { BaseApp } from '../components/BaseApp.js';
import { HUDContextMenu } from './HUDContextMenu.js';
import { ExplorerToolbar } from './ExplorerToolbar.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';
import { SystemMetricsPanel } from '../components/SystemMetricsPanel.js';
import { ExplorerInfoPanel } from './ExplorerInfoPanel.js';

import { InputManager } from './managers/InputManager.js';
import { ReasoningManager } from './managers/ReasoningManager.js';
import { FileManager } from './managers/FileManager.js';

export class ExplorerApp extends BaseApp {
    constructor() {
        super('graph-container', { bagCapacity: 50, showToolbar: true });

        this.inputManager = new InputManager(this);
        this.reasoningManager = new ReasoningManager(this);
        this.fileManager = new FileManager(this);

        this.infoPanel = new ExplorerInfoPanel();

        this.inspectorPanel.onSave = (id, updates) => this.saveNodeChanges(id, updates);
        this.inspectorPanel.onQuery = (term) => this.handleReplCommand(`<${term} ?>?`);
        this.inspectorPanel.onTrace = (id) => this.graph.traceDerivationPath(id);
        this.inspectorPanel.onSelect = (term) => eventBus.emit(EVENTS.CONCEPT_SELECT, { id: term });
    }

    async initialize() {
        this._setupHUD();
        this.graphPanel.initialize();
        this.contextMenu = new HUDContextMenu(this.graph, this);
        this._setupGraphEvents();
        this._initWidgets();

        this.statusBar = new StatusBar('status-bar-container');
        this.statusBar.initialize({
            onModeSwitch: () => this.log('Mode switched', 'system'),
            onThemeToggle: () => this._toggleTheme(),
            onReasonerControl: (action, value) => this.reasoningManager.handleReasonerControl(action, value),
            onReplSubmit: (command) => this.handleReplCommand(command),
            onWidgetToggle: (widgetId) => this.toggleWidget(widgetId),
            onConfig: () => this._showLLMConfig(),
            onMenuAction: (action) => this.inputManager.handleMenuAction(action)
        });

        this._startStatsLoop();
        this.inputManager.initialize();
        this.fileManager.initialize();
        this._restoreTheme();

        await this.reasoningManager.initialize();

        this._subscribeToEvents();
        setTimeout(() => this.toastManager.show('Welcome! Press "?" for keyboard shortcuts.', 'info', 5000), 1000);
    }

    _initWidgets() {
        this.layoutManager.initialize();

        this.layoutManager.createWidget('layers', {
            title: 'Explorer Info',
            icon: '📐',
            component: this.infoPanel,
            dock: 'left',
            visible: true,
            width: '300px'
        });

        this.layoutManager.createWidget('visualization', {
            title: 'Visualization',
            icon: '👁️',
            component: this.visualizationPanel,
            dock: 'left',
            visible: false,
            width: '300px'
        });

        this.metricsPanel = new SystemMetricsPanel(null);
        this.layoutManager.createWidget('metrics', {
            title: 'Metrics',
            icon: '📊',
            component: this.metricsPanel,
            dock: 'right',
            visible: true,
            height: '300px'
        });

        this.layoutManager.createWidget('log', {
            title: 'Log',
            icon: '📝',
            component: this.logPanel,
            dock: 'right',
            visible: true,
            height: '300px'
        });

        this.layoutManager.createWidget('inspector', {
            title: 'Inspector',
            icon: '🔍',
            component: this.inspectorPanel,
            dock: 'left',
            visible: false
        });

        this.layoutManager.createWidget('tasks', {
            title: 'Tasks',
            icon: '✅',
            component: this.taskBrowser,
            dock: 'right',
            visible: true
        });

        this.toolbar = new ExplorerToolbar(this);
        this.layoutManager.createWidget('controls', {
            title: 'Controls',
            icon: '🎮',
            component: this.toolbar,
            dock: 'none',
            visible: true,
            width: 'auto',
            collapsible: true
        });
    }
}
