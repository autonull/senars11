import { GraphPanel } from '../components/GraphPanel.js';
import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';
import { HUDContextMenu } from '../explorer/HUDContextMenu.js';
import { ExplorerToolbar } from '../explorer/ExplorerToolbar.js';
import { Logger } from '../logging/Logger.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';
import { StatusBar } from '../components/StatusBar.js';
import { SystemMetricsPanel } from '../components/SystemMetricsPanel.js';
import { HUDLayoutManager } from '../layout/HUDLayoutManager.js';
import { VisualizationPanel } from '../components/VisualizationPanel.js';
import { LogPanel } from '../components/LogPanel.js';
import { InspectorPanel } from '../components/InspectorPanel.js';
import { TaskBrowser } from '../explorer/TaskBrowser.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { ToastManager } from '../components/ToastManager.js';
import { getTacticalStyle } from '../visualization/ExplorerGraphTheme.js';
import { processNalInput } from '../utils/InputProcessor.js';

/**
 * Base class for SeNARS UI applications.
 * Provides common functionality for graph-based UI applications.
 */
export class BaseApp {
    constructor(containerId = 'graph-container', options = {}) {
        this.mappings = { size: 'priority', color: 'hash' };
        const themeStyle = getTacticalStyle(this.mappings, this._getColorFromHash.bind(this));

        this.graphPanel = new GraphPanel(containerId, {
            useBag: options.bagCapacity ? true : false,
            bagCapacity: options.bagCapacity || 50,
            style: themeStyle,
            showToolbar: options.showToolbar ?? true
        });

        this.contextMenu = null;
        this.commandPalette = new CommandPalette();
        this.toastManager = ToastManager;
        this.logger = new Logger();
        this.mode = 'visualization';

        this.statusBar = null;
        this.metricsPanel = null;
        this.isDecayEnabled = false;
        this.isFocusMode = false;
        this.decayLoopId = null;

        // Components Map for cross-referencing
        this.components = new Map();

        // Layout & Panels
        this.layoutManager = new HUDLayoutManager('hud-overlay');
        this.visualizationPanel = new VisualizationPanel();
        this.logPanel = new LogPanel();
        this.inspectorPanel = new InspectorPanel();
        this.taskBrowser = new TaskBrowser();
    }

    get graph() { return this.graphPanel.graphManager; }
    get isReasonerRunning() { return this.reasoningManager?.isReasonerRunning ?? false; }
    get lmController() { return this.reasoningManager?.lmController; }
    get localToolsBridge() {
        return this.reasoningManager?.lmController?.toolsBridge ??
               this.reasoningManager?.localToolsBridge;
    }

    _setupGraphEvents() {
        if (!this.graph) {
            this.logger.error('GraphPanel failed to initialize graphManager');
            return;
        }

        this.graph.on('nodeClick', ({ node }) => this._handleNodeClick(node));
        this.graph.on('nodeDblClick', ({ node }) => this.log(`Focused: ${node.id()}`, 'system'));
        this.graph.on('contextMenu', ({ target, originalEvent }) => {
            const type = target && target !== this.graph.cy ? (target.isNode() ? 'node' : 'edge') : 'background';
            const evt = originalEvent;
            if (type === 'background') this.contextMenu.show(evt.x, evt.y, null, 'background');
            else this.contextMenu.show(evt.x, evt.y, target, type);
        });
        this.graph.on('backgroundDoubleClick', ({ position }) => 
            this.inputManager?.handleAddConcept(position)
        );
    }

    _handleNodeClick(node) {
        const concept = this.graph.getConcept(node.id());
        if (concept) {
            this.graph.focusNode(node.id());
            this.inspectorPanel.show(concept);
        }
    }

    _getColorFromHash(id) {
        if (!id) return '#cccccc';
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 65%, 55%)`;
    }

    _initWidgets() {
        this.layoutManager.addWidget('visualization-panel', this.visualizationPanel);
        this.layoutManager.addWidget('log-panel', this.logPanel);
        this.layoutManager.addWidget('task-browser', this.taskBrowser);
        this.layoutManager.addWidget('inspector-panel', this.inspectorPanel);
    }

    _setupStatusBar(config = {}) {
        this.statusBar = new StatusBar('status-bar-container');
        this.statusBar.initialize({
            onModeSwitch: config.onModeSwitch,
            onRunClick: config.onRunClick,
            onStopClick: config.onStopClick,
            onStepClick: config.onStepClick,
            onClearClick: config.onClearClick,
            onDecayClick: config.onDecayClick,
            onConfigClick: config.onConfigClick
        });
    }

    _setupMetricsPanel() {
        this.metricsPanel = new SystemMetricsPanel();
        this.layoutManager.addWidget('metrics-panel', this.metricsPanel);
    }

    _setupLMConfigDialog() {
        this.lmConfigDialog = new LMConfigDialog();
        this.lmConfigDialog.initialize({
            onSave: async (config) => {
                try {
                    await this.reasoningManager?.configureLM(config);
                    this.log('LM configuration saved', 'success');
                } catch (error) {
                    this.log(`Failed to save LM config: ${error.message}`, 'error');
                }
            }
        });
    }

    _processNalInput(content) {
        const nar = this.reasoningManager?._getNAR();
        
        if (!nar) {
            this.log('Reasoner not available to process NAL', 'warning');
            return;
        }

        const result = processNalInput(content, nar, (msg, type) => this.log(msg, type));
        this.log(`Processed ${result.valid}/${result.processed} NAL lines`, result.errors.length ? 'warning' : 'success');
    }

    _deepMerge(target, source) {
        const isObject = (item) => (item && typeof item === 'object' && !Array.isArray(item));
        const output = Object.assign({}, target);
        
        if (isObject(target) && isObject(source)) {
            for (const key of Object.keys(source)) {
                if (isObject(source[key])) {
                    output[key] = key in target 
                        ? this._deepMerge(target[key], source[key])
                        : source[key];
                } else {
                    output[key] = source[key];
                }
            }
        }
        return output;
    }

    log(message, type = 'info') {
        this.logger.log(message, type);
    }

    saveNodeChanges(id, updates) {
        const concept = this.graph.getConcept(id);
        if (concept) {
            Object.assign(concept, updates);
            this.graph.updateNode(id, concept);
            this.log(`Updated node: ${id}`, 'success');
        }
    }

    handleReplCommand(command) {
        this.inputManager?.handleCommand(command);
    }
}
