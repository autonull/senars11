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
import { ExplorerInfoPanel } from '../explorer/ExplorerInfoPanel.js';
import { VisualizationPanel } from '../components/VisualizationPanel.js';
import { LogPanel } from '../components/LogPanel.js';
import { InspectorPanel } from '../components/InspectorPanel.js';
import { TaskBrowser } from '../explorer/TaskBrowser.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { ToastManager } from '../components/ToastManager.js';
import { getTacticalStyle } from '../visualization/ExplorerGraphTheme.js';
import { CodeEditorPanel } from '../components/CodeEditorPanel.js';

import { InputManager } from '../explorer/managers/InputManager.js';
import { ReasoningManager } from '../explorer/managers/ReasoningManager.js';
import { FileManager } from '../explorer/managers/FileManager.js';

/**
 * Main application controller for the SeNARS MeTTa UI.
 * Coordinates between Graph, HUD, Agent/Reasoner, and User Input.
 */
export class MettaApp {
    constructor() {
        this.mappings = { size: 'priority', color: 'hash' };
        const themeStyle = getTacticalStyle(this.mappings, this._getColorFromHash.bind(this));

        this.graphPanel = new GraphPanel('graph-container', {
            useBag: true,
            bagCapacity: 50,
            style: themeStyle,
            showToolbar: true
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

        // Components Map for cross-referencing (needed by CodeEditorPanel)
        this.components = new Map();

        // Managers
        this.inputManager = new InputManager(this);
        this.reasoningManager = new ReasoningManager(this);
        this.fileManager = new FileManager(this);

        // Layout & Panels
        this.layoutManager = new HUDLayoutManager('hud-overlay');
        this.infoPanel = new ExplorerInfoPanel();
        this.visualizationPanel = new VisualizationPanel();
        this.logPanel = new LogPanel();
        this.inspectorPanel = new InspectorPanel();
        this.taskBrowser = new TaskBrowser();

        // Editor Panel Setup
        this.codeEditorPanel = new CodeEditorPanel(null);
        this.codeEditorPanel.app = this;
        // Patch initialize to prevent unsetting app when called by HUDLayoutManager without args
        const originalInit = this.codeEditorPanel.initialize.bind(this.codeEditorPanel);
        this.codeEditorPanel.initialize = (app) => {
            if (app) originalInit(app);
            else this.codeEditorPanel.render();
        };

        this.inspectorPanel.onSave = (id, updates) => this.saveNodeChanges(id, updates);
        this.inspectorPanel.onQuery = (term) => this.handleReplCommand(`<${term} ?>?`);
        this.inspectorPanel.onTrace = (id) => this.graph.traceDerivationPath(id);
        this.inspectorPanel.onSelect = (term) => eventBus.emit(EVENTS.CONCEPT_SELECT, { id: term });
    }

    get graph() { return this.graphPanel.graphManager; }
    get isReasonerRunning() { return this.reasoningManager.isReasonerRunning; }
    get lmController() { return this.reasoningManager.lmController; }
    get localToolsBridge() {
        if (this.reasoningManager.lmController && this.reasoningManager.lmController.toolsBridge) {
            return this.reasoningManager.lmController.toolsBridge;
        }
        return this.reasoningManager.localToolsBridge;
    }

    // Bridge for CodeEditorPanel
    get commandProcessor() {
        return {
            processCommand: (text, isSystem, language) => {
                 let cmd = text;
                 // If it's MeTTa and not a system command (!), prepend !
                 if (language === 'metta' && !cmd.trim().startsWith('!')) {
                     cmd = '!' + cmd;
                 }
                 this.handleReplCommand(cmd);
            }
        };
    }

    async initialize() {
        console.log('MettaApp: Initializing...');
        this._setupHUD();
        this.graphPanel.initialize();
        this.contextMenu = new HUDContextMenu(this.graph, this);

        if (!this.graph) {
            console.error("GraphPanel failed to initialize graphManager");
        } else {
            this.graph.on('nodeClick', ({ node }) => this._handleNodeClick(node));
            this.graph.on('nodeDblClick', ({ node }) => this.log(`Focused: ${node.id()}`, 'system'));
            this.graph.on('contextMenu', ({ target, originalEvent }) => {
                const type = target && target !== this.graph.cy ? (target.isNode() ? 'node' : 'edge') : 'background';
                const evt = originalEvent;
                if (type === 'background') this.contextMenu.show(evt.x, evt.y, null, 'background');
                else this.contextMenu.show(evt.x, evt.y, target, type);
            });
            this.graph.on('backgroundDoubleClick', ({ position }) => this.inputManager.handleAddConcept(position));
        }

        this._initWidgets();

        this.statusBar = new StatusBar('status-bar-container');
        this.statusBar.initialize({
            onModeSwitch: () => console.log('Mode Switch'),
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

        console.log('MettaApp: Initialized');
        this._subscribeToEvents();
        setTimeout(() => this.toastManager.show('Welcome to SeNARS MeTTa! Press "?" for keyboard shortcuts.', 'info', 5000), 1000);
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

    // UI Helpers used by managers
    _getColorFromHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return { hue, color: `hsl(${hue}, 70%, 50%)` };
    }

    _updateGraphStyle() {
        if (this.graph && this.graph.cy) {
            const style = getTacticalStyle(this.mappings, this._getColorFromHash.bind(this));
            this.graph.cy.style(style);
        }
    }

    _showLLMConfig() {
        new LMConfigDialog(document.body, {
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
            if (widget) widget.classList.add('active-widget');
        }
    }

    _initWidgets() {
        this.layoutManager.initialize();

        // 1. Editor Panel (Visible by default, Left)
        this.layoutManager.createWidget('editor', {
            title: 'MeTTa Editor',
            icon: '💻',
            component: this.codeEditorPanel,
            dock: 'left',
            visible: true,
            width: '400px'
        });

        // 2. Info Panel (Hidden by default)
        this.layoutManager.createWidget('layers', {
            title: 'Explorer Info',
            icon: '📐',
            component: this.infoPanel,
            dock: 'left',
            visible: false,
            width: '300px'
        });

        // 3. Visualization Panel (Hidden by default)
        this.layoutManager.createWidget('visualization', {
            title: 'Visualization',
            icon: '👁️',
            component: this.visualizationPanel,
            dock: 'left',
            visible: false,
            width: '300px'
        });

        // 4. Metrics Panel (Hidden by default)
        this.metricsPanel = new SystemMetricsPanel(null);
        this.layoutManager.createWidget('metrics', {
            title: 'Metrics',
            icon: '📊',
            component: this.metricsPanel,
            dock: 'right',
            visible: false,
            height: '300px'
        });

        // 5. Log Panel (Visible, Right)
        this.layoutManager.createWidget('log', {
            title: 'Log',
            icon: '📝',
            component: this.logPanel,
            dock: 'right',
            visible: true,
            height: '300px'
        });

        // 6. Inspector Panel (Hidden by default, used for details)
        this.layoutManager.createWidget('inspector', {
            title: 'Inspector',
            icon: '🔍',
            component: this.inspectorPanel,
            dock: 'left',
            visible: false
        });

        // 7. Tasks Browser (Visible, Right)
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

        // Register components for lookup
        this.components.set('code-editor', this.codeEditorPanel);
        this.components.set('log', this.logPanel);
    }

    saveNodeChanges(id, updates) {
        let existing = {};
        if (this.graph.bag?.get(id)) existing = this.graph.bag.get(id).data;
        else if (this.graph.cy) {
            const node = this.graph.cy.$id(id);
            if (node.nonempty()) existing = node.data('fullData') || node.data();
        }

        const payload = this._deepMerge(existing, updates);
        this.graph.updateNode(payload);
        this.log(`Updated node ${id}`, 'success');
        const item = this.graph.bag?.get(id);
        if (item) this.showInspector({ id, ...item.data, ...updates });
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
            if (isVisible) widget.classList.add('active-widget');
            else widget.classList.remove('active-widget');
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
        if (this.logPanel && this.logPanel.addLog) this.logPanel.addLog(message, type);
        else console.log(`[${type.toUpperCase()}] ${message}`);
        if (type === 'error' || type === 'warning' || type === 'success') this.toastManager.show(message, type);
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
        const lines = content.split('\n');
        let count = 0;
        const nar = this.reasoningManager._getNAR();
        lines.forEach(line => {
            const trim = line.trim();
            if (trim && !trim.startsWith('//') && !trim.startsWith(';')) {
                if (nar) { try { nar.input(trim); count++; } catch (e) { } }
            }
        });
        if (!nar) this.log('Reasoner not available to process NAL', 'warning');
        else this.log(`Processed ${count} NAL lines`, 'success');
    }

    _deepMerge(target, source) {
        const isObject = (item) => (item && typeof item === 'object' && !Array.isArray(item));
        const output = Object.assign({}, target);
        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target)) Object.assign(output, { [key]: source[key] });
                    else output[key] = this._deepMerge(target[key], source[key]);
                } else Object.assign(output, { [key]: source[key] });
            });
        }
        return output;
    }

    _startStatsLoop() {
        setInterval(() => {
            const nar = this.reasoningManager._getNAR();
            if (!nar) return;

            const stats = nar.getStats();
            const memoryStats = stats.memoryStats || {};
            const totalConcepts = memoryStats.conceptCount || memoryStats.totalConcepts || (memoryStats.memoryUsage ? memoryStats.memoryUsage.concepts : 0);
            const maxConcepts = (stats.config && stats.config.memory) ? stats.config.memory.maxConcepts : 1000;
            const tps = this.isReasonerRunning ? (1000 / Math.max(this.reasoningManager.reasonerDelay, 1)).toFixed(1) : 0;
            const activeNodes = (this.graph && this.graph.cy) ? this.graph.cy.nodes().length : 0;

            const statsPayload = { cycles: stats.cycleCount || 0, nodes: totalConcepts, activeNodes, maxNodes: maxConcepts, tps };

            if (this.statusBar) this.statusBar.updateStats(statsPayload);
            if (this.infoPanel && this.infoPanel.updateStats) this.infoPanel.updateStats(statsPayload);

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
        if (this.statusBar) this.statusBar.setCapability('llm', state, `LLM: ${text}`);
    }

    _updateReasonerStatus(text, state) {
        if (this.statusBar) this.statusBar.setCapability('reasoner', state, `Reasoner: ${text}`);
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
        const body = document.body;
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
        if (theme === 'light') document.body.classList.add('light-theme');
    }

    _onDerivation(data) {
        const { task, belief, derivedTask, inferenceRule } = data;
        const derivedId = derivedTask.term.toString();
        const sources = [];
        if (task?.term) sources.push(task.term.toString());
        if (belief?.term) sources.push(belief.term.toString());

        const derivation = { rule: inferenceRule || 'Inference', sources: sources };
        const derivedTaskCopy = { ...derivedTask, derivation };

        this._onTaskAdded(derivedTaskCopy);
        const rule = inferenceRule || 'Inference';

        if (task && task.term) {
            const sourceId = task.term.toString();
            if (this.graph.cy.$id(sourceId).empty()) this._onTaskAdded(task);
            this.graph.addEdge({ source: sourceId, target: derivedId, type: 'derivation', label: rule }, false);
        }

        if (belief && belief.term) {
            const beliefId = belief.term.toString();
             if (this.graph.cy.$id(beliefId).empty()) this._onTaskAdded(belief);
            this.graph.addEdge({ source: beliefId, target: derivedId, type: 'derivation', label: rule }, false);
        }
    }

    _onTaskAdded(task) {
        if (!task || !task.term) return;
        if (this.taskBrowser) this.taskBrowser.addTask(task);

        const term = task.term.toString();
        const budget = task.budget || { priority: 0.5 };

        this.graph.addNode({ id: term, term: term, budget: budget, type: 'concept', ...task }, false);
        if (this.graph.animateAttention) this.graph.animateAttention(term);

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
        if (this.graph.scheduleLayout) this.graph.scheduleLayout();
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

    _addMettaTermToGraph(atom) {
        if (!atom) return;
        const id = atom.toString();

        this.graph.addNode({ id: id, term: id, type: 'concept' }, false);

        if (atom.type === 'expression' || (atom.components && atom.components.length > 0)) {
            const components = atom.components || [];

            components.forEach((comp, index) => {
                const compId = comp.toString();
                this._addMettaTermToGraph(comp);

                this.graph.addEdge({
                    source: id,
                    target: compId,
                    type: 'structure',
                    label: index.toString()
                }, false);
            });
        }
    }
}
