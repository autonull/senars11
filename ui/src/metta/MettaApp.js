import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';
import { BaseApp } from '../components/BaseApp.js';
import { HUDContextMenu } from '../explorer/HUDContextMenu.js';
import { ExplorerToolbar } from '../explorer/ExplorerToolbar.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';
import { SystemMetricsPanel } from '../components/SystemMetricsPanel.js';
import { ExplorerInfoPanel } from '../explorer/ExplorerInfoPanel.js';
import { CodeEditorPanel } from '../components/CodeEditorPanel.js';

import { InputManager } from '../explorer/managers/InputManager.js';
import { ReasoningManager } from '../explorer/managers/ReasoningManager.js';
import { FileManager } from '../explorer/managers/FileManager.js';

export class MettaApp extends BaseApp {
    constructor() {
        super('graph-container', { bagCapacity: 50, showToolbar: true });

        this.inputManager = new InputManager(this);
        this.reasoningManager = new ReasoningManager(this);
        this.fileManager = new FileManager(this);

        this.infoPanel = new ExplorerInfoPanel();
        
        this.codeEditorPanel = new CodeEditorPanel(null);
        this.codeEditorPanel.app = this;
        const originalInit = this.codeEditorPanel.initialize.bind(this.codeEditorPanel);
        this.codeEditorPanel.initialize = (app) => {
            app ? originalInit(app) : this.codeEditorPanel.render();
        };

        this.inspectorPanel.onSave = (id, updates) => this.saveNodeChanges(id, updates);
        this.inspectorPanel.onQuery = (term) => this.handleReplCommand(`<${term} ?>?`);
        this.inspectorPanel.onTrace = (id) => this.graph.traceDerivationPath(id);
        this.inspectorPanel.onSelect = (term) => eventBus.emit(EVENTS.CONCEPT_SELECT, { id: term });
    }

    get commandProcessor() {
        return {
            processCommand: (text, isSystem, language) => {
                let cmd = text;
                if (language === 'metta' && !cmd.trim().startsWith('!')) {
                    cmd = `!${  cmd}`;
                }
                this.handleReplCommand(cmd);
            }
        };
    }

    async initialize() {
        this._setupHUD();
        this.graphPanel.initialize();
        this.contextMenu = new HUDContextMenu(this.graph, this);
        this._setupGraphEvents();
        this._initWidgets();

        this.statusBar = new StatusBar('status-bar-container');
        this.statusBar.initialize({
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
        setTimeout(() => this.toastManager.show('Welcome to SeNARS MeTTa! Press "?" for keyboard shortcuts.', 'info', 5000), 1000);
    }

    _initWidgets() {
        this.layoutManager.initialize();

        this.layoutManager.createWidget('editor', {
            title: 'MeTTa Editor',
            icon: '💻',
            component: this.codeEditorPanel,
            dock: 'left',
            visible: true,
            width: '400px'
        });

        this.layoutManager.createWidget('layers', {
            title: 'Explorer Info',
            icon: '📐',
            component: this.infoPanel,
            dock: 'left',
            visible: false,
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
            visible: false,
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

        this.components.set('code-editor', this.codeEditorPanel);
        this.components.set('log', this.logPanel);
    }

    _getMetta() {
        if (this.lmController && this.lmController.toolsBridge && this.lmController.toolsBridge.metta) {
            return this.lmController.toolsBridge.metta;
        }
        if (this.localToolsBridge && this.localToolsBridge.metta) {
            return this.localToolsBridge.metta;
        }
        return null;
    }

    clearGraph() {
        this.graph.clear();
        this.log('Graph cleared.', 'system');
    }

    visualizeAtomSpace() {
        const metta = this._getMetta();
        if (!metta) {
            this.log('MeTTa interpreter not available', 'error');
            return;
        }

        const allAtoms = metta.space.all ? metta.space.all() : Array.from(metta.space.atoms);

        this.graph.clear();
        this.log(`Visualizing ${allAtoms.length} atoms...`, 'system');

        let count = 0;
        for (const atom of allAtoms) {
            this._addMettaTermToGraph(atom);
            count++;
        }

        this.graph.scheduleLayout();
        this.log(`Visualized ${count} atoms.`, 'success');
    }

    _addMettaTermToGraph(atom, parentId = null, edgeLabel = '') {
        if (!atom) {return;}

        const id = atom.toString();
        let type = 'concept';
        if (atom.type === 'compound' || (atom.components && atom.components.length > 0)) {type = 'compound';}
        else if (atom.name && atom.name.startsWith('$')) {type = 'variable';}
        else if (atom.name) {type = 'symbol';}

        this.graph.addNode({
            id: id,
            term: id,
            type: type,
            raw: atom
        }, false);

        if (parentId && parentId !== id) {
            this.graph.addEdge({
                source: parentId,
                target: id,
                type: 'structure',
                label: edgeLabel
            }, false);
        }

        if (atom.type === 'compound' || (atom.components && atom.components.length > 0)) {
            const components = atom.components || [];
            components.forEach((comp, index) => {
                this._addMettaTermToGraph(comp, id, index.toString());
            });
        }
    }
}
