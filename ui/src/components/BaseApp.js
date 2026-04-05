import { GraphPanel } from './GraphPanel.js';
import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';
import { Logger } from '../logging/Logger.js';
import { StatusBar } from './StatusBar.js';
import { SystemMetricsPanel } from './SystemMetricsPanel.js';
import { HUDLayoutManager } from '../layout/HUDLayoutManager.js';
import { VisualizationPanel } from './VisualizationPanel.js';
import { LogPanel } from './LogPanel.js';
import { InspectorPanel } from './InspectorPanel.js';
import { CommandPalette } from './CommandPalette.js';
import { ToastManager } from './ToastManager.js';
import { getTacticalStyle } from '../visualization/ExplorerGraphTheme.js';
import { processNalInput } from '../utils/InputProcessor.js';
import { deepMerge } from '@senars/core';

// Lazy-loaded cross-layer dependencies (inverted via dynamic import)
let HUDContextMenu = null;
let ExplorerToolbar = null;
let TaskBrowser = null;
let LMConfigDialog = null;

async function loadCrossLayerDeps() {
    if (!HUDContextMenu) {
        const [hud, toolbar, task, lm] = await Promise.all([
            import('../explorer/HUDContextMenu.js'),
            import('../explorer/ExplorerToolbar.js'),
            import('../explorer/TaskBrowser.js'),
            import('../agent/LMConfigDialog.js')
        ]);
        HUDContextMenu = hud.HUDContextMenu;
        ExplorerToolbar = toolbar.ExplorerToolbar;
        TaskBrowser = task.TaskBrowser;
        LMConfigDialog = lm.LMConfigDialog;
    }
    return { HUDContextMenu, ExplorerToolbar, TaskBrowser, LMConfigDialog };
}

export class BaseApp {
    constructor(containerId = 'graph-container', options = {}) {
        this.mappings = { size: 'priority', color: 'hash' };
        const themeStyle = getTacticalStyle(this.mappings, this._getColorFromHash.bind(this));

        this.graphPanel = new GraphPanel(containerId, {
            useBag: !!options.bagCapacity,
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

        this.components = new Map();

        this.layoutManager = new HUDLayoutManager('hud-overlay');
        this.visualizationPanel = new VisualizationPanel();
        this.logPanel = new LogPanel();
        this.inspectorPanel = new InspectorPanel();
        this.taskBrowser = null; // lazy-loaded
        this._initTaskBrowser();
    }

    get graph() { return this.graphPanel.graphManager; }
    get isReasonerRunning() { return this.reasoningManager?.isReasonerRunning ?? false; }
    get lmController() { return this.reasoningManager?.lmController; }
    get localToolsBridge() {
        return this.reasoningManager?.lmController?.toolsBridge ??
               this.reasoningManager?.localToolsBridge;
    }

    async _initTaskBrowser() {
        const { TaskBrowser: TB } = await loadCrossLayerDeps();
        if (!this.taskBrowser) {this.taskBrowser = new TB();}
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
            if (type === 'background') {this.contextMenu.show(evt.x, evt.y, null, 'background');}
            else {this.contextMenu.show(evt.x, evt.y, target, type);}
        });
        this.graph.on('backgroundDoubleClick', ({ position }) => 
            this.inputManager?.handleAddConcept(position)
        );
    }

    _handleNodeClick(node) {
        const data = node.data();
        this.graph.flyTo?.(node.id());
        const links = node.connectedEdges().map(edge => {
             const target = edge.target();
             const source = edge.source();
             return target.id() === node.id() ? source.id() : target.id();
        }).slice(0, 5);

        const fullData = data.fullData || {};
        this.showInspector({
            id: node.id(),
            links,
            ...data,
            ...fullData,
            derivation: fullData.derivation || data.derivation,
            budget: fullData.budget || data.budget,
            truth: fullData.truth || data.truth
        });
    }

    _subscribeToEvents() {
        eventBus.on(EVENTS.TASK_SELECT, ({ task }) => {
            if (task && task.term) {
                const term = task.term.toString();
                const node = this.graph.cy.$id(term);
                if (node.nonempty()) {
                    this.graph.cy.animate({ center: { eles: node }, zoom: 1.5, duration: 500 });
                    node.select();
                    const data = node.data();
                    this.showInspector({ id: term, ...data, ...(data.fullData || {}) });
                } else {
                    this.showInspector({ id: term, term: term, ...task, ...(task.raw || {}) });
                }
            }
        });

        eventBus.on(EVENTS.CONCEPT_SELECT, ({ id, term }) => {
            const nodeId = id || term;
            const node = this.graph.cy.$id(nodeId);
            if (node.nonempty()) {
                this.graph.cy.animate({ center: { eles: node }, zoom: 1.5, duration: 500 });
                node.select();
                const data = node.data();
                this.showInspector({ id: nodeId, ...data, ...(data.fullData || {}) });
            } else {
                 this.log(`Concept not in view: ${nodeId}`, 'warning');
            }
        });

        eventBus.on('visualization.settings', (settings) => {
            let mappingsChanged = false;
            if (settings.mappingSize && settings.mappingSize !== this.mappings.size) {
                this.mappings.size = settings.mappingSize;
                mappingsChanged = true;
            }
            if (settings.mappingColor && settings.mappingColor !== this.mappings.color) {
                this.mappings.color = settings.mappingColor;
                mappingsChanged = true;
            }

            if (mappingsChanged) {
                this._updateGraphStyle();
            }

            if (settings.bagCapacity && this.graph && this.graph.bag) {
                this.graph.bag.capacity = settings.bagCapacity;
            }
        });
    }

    // Proxy methods for Managers
    toggleReasoner(run) { this.reasoningManager.toggleReasoner(run); }
    stepReasoner() { this.reasoningManager.stepReasoner(); }
    showDemoLibrary() { this.inputManager.showDemoLibrary(); }
    loadDemo(name) { this.inputManager.loadDemo(name); }
    toggleDecay(forceState) { this.inputManager.toggleDecay(forceState); }
    setMode(mode) { this.inputManager.setMode(mode); }
    handleAddConcept(pos) { this.inputManager.handleAddConcept(pos); }
    handleAddLink() { this.inputManager.handleAddLink(); }
    handleDelete() { this.inputManager.handleDelete(); }

    _getColorFromHash(str) {
        if (!str) {return { hue: 0, color: '#cccccc' };}
        const hash = [...str].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0);
        const hue = Math.abs(hash % 360);
        return { hue, color: `hsl(${hue}, 70%, 50%)` };
    }

    _updateGraphStyle() {
        if (this.graph?.cy) {
            const style = getTacticalStyle(this.mappings, this._getColorFromHash.bind(this));
            this.graph.cy.style(style);
        }
    }

    async _showLLMConfig() {
        const { LMConfigDialog: LCD } = await loadCrossLayerDeps();
        new LCD(document.body, {
            onSave: async (config) => {
                if (this.lmController) {
                    await this.lmController.reconfigure(config);
                    this._updateLLMStatus('Ready', 'ready');
                } else {
                    alert('LLM Controller not available.');
                }
            }
        }).show();
    }

    showInspector(data) {
        this.inspectorPanel.update(data, this.mode);
        if (this.layoutManager) {
            this.layoutManager.show('inspector');
            const widget = this.layoutManager.getWidget('inspector');
            if (widget) {widget.classList.add('active-widget');}
        }
    }

    saveNodeChanges(id, updates) {
        let existing = {};
        if (this.graph.bag?.get(id)) {existing = this.graph.bag.get(id).data;}
        else if (this.graph.cy) {
            const node = this.graph.cy.$id(id);
            if (node.nonempty()) {existing = node.data('fullData') || node.data();}
        }

        const payload = deepMerge(existing, updates);
        this.graph.updateNode(payload);
        this.log(`Updated node ${id}`, 'success');
        const item = this.graph.bag?.get(id);
        if (item) {this.showInspector({ id, ...item.data, ...updates });}
    }

    _setupHUD() {
        if (!document.querySelector('.hud-grid-background')) {
            const grid = document.createElement('div');
            grid.className = 'hud-grid-background';
            document.body.prepend(grid);
        }
    }

    toggleWidget(widgetId) {
        this.layoutManager.toggle(widgetId);
        const widget = this.layoutManager.getWidget(widgetId);
        if (widget) {
            const isVisible = !widget.classList.contains('hidden');
            this.log(`${widgetId} widget ${isVisible ? 'shown' : 'hidden'}`, 'system');
            if (isVisible) {widget.classList.add('active-widget');}
            else {widget.classList.remove('active-widget');}
            return isVisible;
        }
        return false;
    }

    toggleFocusMode() {
        this.inputManager.toggleFocusMode();
    }

    handleToggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                this.log(`Error enabling fullscreen: ${err.message}`, 'error');
            });
        } else {
            document.exitFullscreen();
        }
    }

    async handleReplCommand(command) {
        this.inputManager.handleReplCommand(command);
    }

    log(message, type = 'info') {
        if (this.logPanel && this.logPanel.addLog) {this.logPanel.addLog(message, type);}
        else {console.log(`[${type.toUpperCase()}] ${message}`);}
        if (type === 'error' || type === 'warning' || type === 'success') {this.toastManager.show(message, type);}
    }

    loadGraphData(data) {
        this.fileManager.loadGraphData(data);
    }

    processMeTTaContent(code, filename) {
        this.log(`Loading MeTTa content: ${filename}`, 'system');
        this.handleReplCommand(`!${code}`);
    }

    processNALContent(content, filename) {
        this.log(`Loading NAL content: ${filename}`, 'system');
        this._processNalInput(content);
    }

    _startStatsLoop() {
        setInterval(() => {
            const nar = this.reasoningManager._getNAR();
            if (!nar) {return;}

            const stats = nar.getStats();
            const memoryStats = stats.memoryStats ?? {};
            const totalConcepts = memoryStats.conceptCount ?? memoryStats.totalConcepts ?? memoryStats.memoryUsage?.concepts ?? 0;
            const maxConcepts = stats.config?.memory?.maxConcepts ?? 1000;
            const tps = this.isReasonerRunning ? (1000 / Math.max(this.reasoningManager.reasonerDelay, 1)).toFixed(1) : 0;
            const activeNodes = this.graph?.cy?.nodes().length ?? 0;

            const statsPayload = { 
                cycles: stats.cycleCount ?? 0, 
                nodes: totalConcepts, 
                activeNodes, 
                maxNodes: maxConcepts, 
                tps 
            };

            this.statusBar?.updateStats(statsPayload);
            this.infoPanel?.updateStats(statsPayload);

            if (this.metricsPanel) {
                this.metricsPanel.update({
                    performance: { throughput: this.isReasonerRunning ? (1000 / Math.max(this.reasoningManager.reasonerDelay, 1)) : 0, avgLatency: 0 },
                    resourceUsage: { heapUsed: totalConcepts, heapTotal: maxConcepts },
                    taskProcessing: { totalProcessed: stats.cycleCount, successful: stats.cycleCount },
                    reasoningSteps: stats.cycleCount,
                    uptime: Date.now() - (nar._startTime || Date.now())
                });
            }
        }, 500);
    }

    _updateLLMStatus(text, state) {
        if (this.statusBar) {this.statusBar.setCapability('llm', state, `LLM: ${text}`);}
    }

    _updateReasonerStatus(text, state) {
        if (this.statusBar) {this.statusBar.setCapability('reasoner', state, `Reasoner: ${text}`);}
    }

    _updateStats() {
        // Handled by loop
    }

    _highlightMatches(term) {
        this.inputManager._highlightMatches(term);
    }

    _findNode(id) {
        return this.inputManager._findNode(id);
    }

    _toggleTheme() {
        const {body} = document;
        if (body.classList.contains('light-theme')) {
            body.classList.remove('light-theme');
            localStorage.setItem('senars-theme', 'dark');
            this.log('Switched to Dark Theme', 'system');
        } else {
            body.classList.add('light-theme');
            localStorage.setItem('senars-theme', 'light');
            this.log('Switched to Light Theme', 'system');
        }
    }

    _restoreTheme() {
        const theme = localStorage.getItem('senars-theme');
        if (theme === 'light') {document.body.classList.add('light-theme');}
    }

    _onDerivation(data) {
        const { task, belief, derivedTask, inferenceRule } = data;
        const derivedId = derivedTask.term.toString();
        const sources = [];
        if (task?.term) {sources.push(task.term.toString());}
        if (belief?.term) {sources.push(belief.term.toString());}

        const derivation = { rule: inferenceRule || 'Inference', sources: sources };
        const derivedTaskCopy = { ...derivedTask, derivation };

        this._onTaskAdded(derivedTaskCopy);
        const rule = inferenceRule || 'Inference';

        if (task && task.term) {
            const sourceId = task.term.toString();
            if (this.graph.cy.$id(sourceId).empty()) {this._onTaskAdded(task);}
            this.graph.addEdge({ source: sourceId, target: derivedId, type: 'derivation', label: rule }, false);
        }

        if (belief && belief.term) {
            const beliefId = belief.term.toString();
             if (this.graph.cy.$id(beliefId).empty()) {this._onTaskAdded(belief);}
            this.graph.addEdge({ source: beliefId, target: derivedId, type: 'derivation', label: rule }, false);
        }
    }

    _onTaskAdded(task) {
        if (!task || !task.term) {return;}
        if (this.taskBrowser) {this.taskBrowser.addTask(task);}

        const term = task.term.toString();
        const budget = task.budget || { priority: 0.5 };

        this.graph.addNode({ id: term, term: term, budget: budget, type: 'concept', ...task }, false);
        if (this.graph.animateAttention) {this.graph.animateAttention(term);}

        if (term.startsWith('(-->')) {
             const parts = term.replace(/^\(-->\s*,?\s*|\)$/g, '').split(',').map(s => s.trim());
             if (parts.length >= 2) {
                 this.graph.addNode({ id: parts[0], term: parts[0] }, false);
                 this.graph.addNode({ id: parts[1], term: parts[1] }, false);
                 this.graph.addEdge({ source: parts[0], target: parts[1], type: 'inheritance' }, false);
             }
        } else if (term.includes('-->')) {
             const parts = term.replace(/[<>]/g, '').split('-->');
             if (parts.length === 2) {
                 const s = parts[0].trim();
                 const t = parts[1].trim();
                 this.graph.addNode({ id: s, term: s }, false);
                 this.graph.addNode({ id: t, term: t }, false);
                 this.graph.addEdge({ source: s, target: t, type: 'inheritance' }, false);
             }
        }
        if (this.graph.scheduleLayout) {this.graph.scheduleLayout();}
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
}
