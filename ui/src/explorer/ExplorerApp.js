import { ExplorerGraph } from './ExplorerGraph.js';
import { ExplorerContextMenu } from './ExplorerContextMenu.js';
import { Logger } from '../logging/Logger.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';
import { DEMOS } from './demos.js';
import { StatusBar } from '../components/StatusBar.js';
import { SystemMetricsPanel } from '../components/SystemMetricsPanel.js';
import { HUDLayoutManager } from '../layout/HUDLayoutManager.js';
import { InfoPanel } from '../components/InfoPanel.js';
import { ControlToolbar } from '../components/ControlToolbar.js';
import { LogPanel } from '../components/LogPanel.js';
import { InspectorPanel } from '../components/InspectorPanel.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { ToastManager } from '../components/ToastManager.js';
import { DemoLibraryModal } from '../components/DemoLibraryModal.js';

export class ExplorerApp {
    constructor() {
        this.graph = new ExplorerGraph('graph-container');
        this.contextMenu = new ExplorerContextMenu(this.graph, this);
        this.commandPalette = new CommandPalette();
        this.toastManager = new ToastManager();
        this.logger = new Logger();
        this.lmController = null;
        this.mode = 'visualization';

        this.isReasonerRunning = false;
        this.reasonerDelay = 100;
        this.reasonerLoopId = null;
        this.statusBar = null;
        this.metricsPanel = null;

        this.isDecayEnabled = false;
        this.decayLoopId = null;

        // Layout & Panels
        this.layoutManager = new HUDLayoutManager('hud-overlay');
        this.infoPanel = new InfoPanel();
        this.controlToolbar = new ControlToolbar();
        this.logPanel = new LogPanel();
        this.inspectorPanel = new InspectorPanel();

        // Wire up inspector save callback
        this.inspectorPanel.onSave = (id, updates) => this.saveNodeChanges(id, updates);
    }

    async initialize() {
        console.log('ExplorerApp: Initializing...');

        this._setupHUD();

        // Init Graph
        await this.graph.initialize();
        this.loadDemo('Solar System');

        this.graph.onNodeTap((data) => this.showInspector(data));

        // Register Commands
        this._registerCommands();

        this.graph.onContextTap((evt, element, type) => {
            if (type === 'background') {
                this.contextMenu.show(evt.x, evt.y, null, 'background');
            } else {
                this.contextMenu.show(evt.x, evt.y, element, type);
            }
        });

        // Init Layout System
        this.layoutManager.initialize();

        // Instantiate and Mount Components
        this.layoutManager.addComponent(this.infoPanel, 'top');

        // Metrics - Mount to top region
        this.metricsPanel = new SystemMetricsPanel(null); // No static container
        this.metricsPanel.initialize();
        this.layoutManager.addComponent(this.metricsPanel, 'top');

        this.layoutManager.addComponent(this.controlToolbar, 'bottom');
        this.layoutManager.addComponent(this.logPanel, 'left');
        this.layoutManager.addComponent(this.inspectorPanel, 'right');

        // Init Components (StatusBar)
        this.statusBar = new StatusBar('status-bar-container');
        this.statusBar.initialize({
            onModeSwitch: () => console.log('Mode Switch'),
            onThemeToggle: () => console.log('Theme Toggle')
        });

        // Start stats update loop
        this._startStatsLoop();

        // Init UI Bindings
        this._bindControls();

        // Dynamic import of LLM Controller
        try {
            const module = await import('../agent/LMAgentController.js');
            this.lmController = new module.LMAgentController(this.logger);
            this._setupLMEvents();

            try {
                await this.lmController.initialize();
                this._updateLLMStatus('Ready', 'ready');
            } catch (e) {
                console.warn('LLM init failed (might need config):', e);
                this._updateLLMStatus('Config Required', 'error');
            }
        } catch (e) {
            console.error('Failed to load LMAgentController module:', e);
            this._updateLLMStatus('Module Error', 'error');
        }

        console.log('ExplorerApp: Initialized');
    }

    _bindControls() {
        // Navigation Controls
        this._bindClick('btn-fit', () => this.graph.fit());
        this._bindClick('btn-in', () => this.graph.zoomIn());
        this._bindClick('btn-out', () => this.graph.zoomOut());
        this._bindClick('btn-layout', () => this.graph.relayout());

        // Data Controls
        this._bindClick('btn-clear', () => {
            this.graph.clear();
            this.log('Cleared workspace.', 'system');
            this._updateStats();
        });

        // Search
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const term = searchInput.value.trim();
                    if (term) {
                        const foundNode = this.graph.findNode(term);
                        if (foundNode) {
                            this.log(`Found: ${term}`, 'system');
                            searchInput.value = '';

                            this.showInspector({
                                id: foundNode.id(),
                                ...foundNode.data()
                            });
                            foundNode.select();
                        } else {
                            this.log(`Not found: ${term}`, 'warning');
                        }
                    }
                }
            };
        }

        // Demo Select (Deprecated by Command/Modal but kept for legacy UI if present)
        const demoSelect = document.getElementById('demo-select');
        if (demoSelect) {
            // Remove existing logic to avoid duplicates if re-bound
            const newSelect = demoSelect.cloneNode(false);
            demoSelect.parentNode.replaceChild(newSelect, demoSelect);

            Object.keys(DEMOS).forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                newSelect.appendChild(opt);
            });

            newSelect.onchange = (e) => {
                if (e.target.value) {
                    this.loadDemo(e.target.value);
                    e.target.value = "";
                }
            };
        }

        // Inspector
        this._bindClick('btn-close-inspector', () => {
             const panel = document.getElementById('inspector-panel');
             if(panel) panel.classList.add('hidden');
        });

        // Mode Switching
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setMode(e.target.dataset.mode);
            };
        });

        // Layer Toggles
        document.querySelectorAll('input[data-layer]').forEach(input => {
            input.onchange = (e) => {
                const layer = e.target.dataset.layer;
                const visible = e.target.checked;
                this.graph.toggleLayer(layer, visible);
                this.log(`${layer} layer ${visible ? 'visible' : 'hidden'}`, 'system');
            };
        });

        // Visual Mappings
        const sizeSelect = document.getElementById('mapping-size');
        if (sizeSelect) {
            sizeSelect.onchange = (e) => {
                this.graph.setSizeMapping(e.target.value);
                this.log(`Size mapping: ${e.target.value}`, 'system');
            };
        }

        const colorSelect = document.getElementById('mapping-color');
        if (colorSelect) {
            colorSelect.onchange = (e) => {
                this.graph.setColorMapping(e.target.value);
                this.log(`Color mapping: ${e.target.value}`, 'system');
            };
        }

        // Gardening Tools
        this._bindClick('btn-add-concept', () => this.handleAddConcept());
        this._bindClick('btn-add-link', () => this.handleAddLink());
        this._bindClick('btn-delete', () => this.handleDelete());

        // Reasoner Controls
        this._bindClick('btn-run', () => this.toggleReasoner(true));
        this._bindClick('btn-pause', () => this.toggleReasoner(false));
        this._bindClick('btn-step', () => this.stepReasoner());

        const slider = document.getElementById('throttle-slider');
        const label = document.getElementById('throttle-val');
        if (slider && label) {
            slider.oninput = (e) => {
                this.reasonerDelay = parseInt(e.target.value);
                label.textContent = `${this.reasonerDelay}ms`;
            };
        }

        // LLM Config
        this._bindClick('btn-llm-config', () => {
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
        });

        // REPL
        const input = document.getElementById('repl-input');
        if (input) {
            input.onkeydown = async (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    const command = input.value.trim();
                    input.value = '';
                    await this.handleReplCommand(command);
                }
            };
        }
    }

    _bindClick(id, handler) {
        const el = document.getElementById(id);
        if (el) el.onclick = handler;
    }

    loadDemo(name) {
        const demo = DEMOS[name];
        if (!demo) return;

        this.graph.clear();
        this.log(`Loading demo: ${name}`, 'system');
        this.toastManager.show(`Demo loaded: ${name}`, 'success');

        demo.concepts.forEach(c => this.graph.addConcept(c.term, c.priority, { type: c.type }));
        demo.relationships.forEach(r => this.graph.addRelationship(r[0], r[1], r[2]));

        this.graph.relayout();
        this._updateStats();
    }

    showInspector(data) {
        this.inspectorPanel.update(data, this.mode);
    }

    saveNodeChanges(id, updates) {
        // Update Bag
        const item = this.graph.bag.items.get(id);
        if (item) {
            Object.assign(item, updates);
            this.graph.bag.items.set(id, item);
        }

        // Update Graph Node
        const cyNode = this.graph.viewport.cy.$id(id);
        if (cyNode && cyNode.length > 0) {
            cyNode.data(updates);
        }

        this.log(`Updated node ${id}`, 'success');
        this.showInspector({ id, ...item.data, ...updates });
    }

    _setupHUD() {
        // Inject HUD visual elements
        if (!document.querySelector('.hud-grid-background')) {
            const grid = document.createElement('div');
            grid.className = 'hud-grid-background';
            document.body.prepend(grid);
        }
    }

    _registerCommands() {
        // Navigation
        this.commandPalette.registerCommand('fit', 'Fit View to Graph', 'F', () => this.graph.fit());
        this.commandPalette.registerCommand('zoom-in', 'Zoom In', '+', () => this.graph.zoomIn());
        this.commandPalette.registerCommand('zoom-out', 'Zoom Out', '-', () => this.graph.zoomOut());
        this.commandPalette.registerCommand('layout', 'Re-calculate Layout', 'L', () => this.graph.relayout());

        // Data
        this.commandPalette.registerCommand('clear', 'Clear Workspace', null, () => {
             this.graph.clear();
             this.log('Workspace cleared', 'system');
        });

        this.commandPalette.registerCommand('add-concept', 'Add New Concept', 'A', () => this.handleAddConcept());
        this.commandPalette.registerCommand('link', 'Link Selected Nodes', null, () => this.handleAddLink());
        this.commandPalette.registerCommand('delete', 'Delete Selected', 'Del', () => this.handleDelete());

        // Attention / Decay
        this.commandPalette.registerCommand('toggle-decay', 'Toggle Attention Decay', null, () => this.toggleDecay());

        // Reasoner
        this.commandPalette.registerCommand('run', 'Run Reasoner', 'Space', () => this.toggleReasoner(!this.isReasonerRunning));
        this.commandPalette.registerCommand('step', 'Step Reasoner', 'S', () => this.stepReasoner());

        // UI
        this.commandPalette.registerCommand('mode-vis', 'Switch to Visualization Mode', null, () => this.setMode('visualization'));
        this.commandPalette.registerCommand('mode-ctl', 'Switch to Control Mode', null, () => this.setMode('control'));

        // Demos
        this.commandPalette.registerCommand('demos', 'Browse Demo Library', 'D', () => this.showDemoLibrary());

        Object.keys(DEMOS).forEach(name => {
            this.commandPalette.registerCommand(`demo-${name.toLowerCase().replace(/\s/g, '-')}`, `Load Demo: ${name}`, null, () => this.loadDemo(name));
        });
    }

    showDemoLibrary() {
        const modal = new DemoLibraryModal({
            onSelect: (name) => this.loadDemo(name)
        });
        modal.show();
    }

    toggleDecay(forceState) {
        this.isDecayEnabled = forceState !== undefined ? forceState : !this.isDecayEnabled;

        if (this.isDecayEnabled) {
            this.log('Attention Decay: ON', 'system');
            this.decayLoopId = setInterval(() => this._processDecay(), 1000);
        } else {
            this.log('Attention Decay: OFF', 'system');
            clearInterval(this.decayLoopId);
        }
    }

    _processDecay() {
        const removed = this.graph.bag.decay(0.98, 0.05); // Decay factor, threshold

        if (removed.length > 0) {
            this.graph._syncGraph(); // Full sync if removal
        } else {
            this.graph.updatePriorities(); // Just visual update
        }

        this._updateStats();
    }

    _updateStats() {
        const bag = this.graph.bag;
        const el = document.getElementById('bag-stats');
        if (el && bag) {
            el.textContent = `Bag: ${bag.items.size} / ${bag.capacity}`;
        }
    }

    async handleReplCommand(command) {
        this.log(`> ${command}`, 'user');

        if (command === '/clear') {
            document.getElementById('log-content').innerHTML = '';
            return;
        }
        if (command === '/help') {
            this.log('Available commands: /clear, /help', 'system');
            return;
        }

        if (this.lmController) {
            try {
                const response = await this.lmController.chat(command);
                this.log(response, 'agent');
            } catch (e) {
                this.log(`Error: ${e.message}`, 'error');
            }
        } else {
            this.log('Agent offline. Connect LLM to chat.', 'warning');
        }
    }

    log(message, type = 'info') {
        const logPanel = document.getElementById('log-content');
        if (!logPanel) return;

        const entry = document.createElement('div');
        entry.style.marginBottom = '4px';
        entry.style.wordWrap = 'break-word';

        const timestamp = new Date().toLocaleTimeString();

        let color = '#aaa';
        if (type === 'user') color = '#00ff9d';
        if (type === 'agent') color = '#00d4ff';
        if (type === 'error') color = '#ff5555';
        if (type === 'warning') color = '#ffbb00';
        if (type === 'system') color = '#cc88ff';
        if (type === 'success') color = '#55ff55';

        entry.innerHTML = `<span style="color:#666">[${timestamp}]</span> <span style="color:${color}">${message}</span>`;

        logPanel.appendChild(entry);
        logPanel.scrollTop = logPanel.scrollHeight;

        // Also show toast for important events
        if (type === 'error' || type === 'warning' || type === 'success') {
            this.toastManager.show(message, type);
        }
    }

    setMode(mode) {
        this.mode = mode;
        this.graph.setMode(mode);

        // Show/Hide Control Toolbar via CSS class, though now it's in a wrapper
        const toolbar = document.getElementById('control-toolbar');
        if (toolbar) {
            if (mode === 'control') {
                toolbar.classList.remove('hidden');
            } else {
                toolbar.classList.add('hidden');
            }
        }

        // We could also ask LayoutManager to swap components here if we wanted completely different layouts

        console.log(`Mode switched to: ${mode}`);
    }

    handleAddConcept() {
        const term = prompt("Enter concept name:");
        if (term) {
            this.graph.addConcept(term, 0.5, { type: 'concept' }); // Default priority 0.5
            this.log(`Created concept: ${term}`, 'user');
        }
    }

    handleAddLink() {
        if (!this.graph.viewport.cy) return;
        const selected = this.graph.viewport.cy.$(':selected');

        if (selected.length !== 2) {
            alert("Please select exactly two nodes to link.");
            return;
        }

        const source = selected[0].id();
        const target = selected[1].id();

        const type = prompt(`Link ${source} -> ${target} as:`, 'implication');
        if (type) {
            this.graph.addRelationship(source, target, type);
            this.log(`Linked ${source} -> ${target} (${type})`, 'user');
        }
    }

    handleDelete() {
        if (!this.graph.viewport.cy) return;
        const selected = this.graph.viewport.cy.$(':selected');

        if (selected.empty()) {
            return;
        }

        if (confirm(`Delete ${selected.length} items?`)) {
            selected.forEach(ele => {
                if (ele.isNode()) {
                    this.graph.bag.remove(ele.id());
                }

                if (ele.isEdge()) {
                    ele.remove();
                }
            });

            this.graph._syncGraph();
            this.log(`Deleted ${selected.length} items.`, 'user');
            this._updateStats();
        }
    }

    _setupLMEvents() {
        if (!this.lmController) return;
        this.lmController.on('model-load-start', () => this._updateLLMStatus('Loading...', 'loading'));
        this.lmController.on('model-load-complete', () => this._updateLLMStatus('Online', 'online'));
    }

    _updateLLMStatus(text, state) {
        const el = document.getElementById('llm-status');
        if (el) {
            el.textContent = text;
            el.className = `status-indicator status-${state}`;
        }
    }

    toggleReasoner(run) {
        this.isReasonerRunning = run;
        const btnRun = document.getElementById('btn-run');
        const btnPause = document.getElementById('btn-pause');

        if (run) {
            if(btnRun) btnRun.classList.add('hidden');
            if(btnPause) btnPause.classList.remove('hidden');
            this._runReasonerLoop();
            this.log('Reasoner started', 'system');
        } else {
            if(btnRun) btnRun.classList.remove('hidden');
            if(btnPause) btnPause.classList.add('hidden');
            if (this.reasonerLoopId) {
                clearTimeout(this.reasonerLoopId);
                this.reasonerLoopId = null;
            }
            this.log('Reasoner paused', 'system');
        }
    }

    async stepReasoner() {
        if (!this.lmController || !this.lmController.toolsBridge) {
            this.log('Reasoner not available (LLM not connected?)', 'warning');
            return;
        }

        const nar = this.lmController.toolsBridge.getNAR();
        if (!nar) {
             this.log('NAR instance not found', 'error');
             return;
        }

        try {
            await nar.step();
        } catch (e) {
            this.log(`Reasoner step error: ${e.message}`, 'error');
            this.toggleReasoner(false);
        }
    }

    async _runReasonerLoop() {
        if (!this.isReasonerRunning) return;

        await this.stepReasoner();

        if (this.isReasonerRunning) {
            this.reasonerLoopId = setTimeout(() => this._runReasonerLoop(), this.reasonerDelay);
        }
    }

    _startStatsLoop() {
        setInterval(() => {
            if (!this.lmController || !this.lmController.toolsBridge) return;
            const nar = this.lmController.toolsBridge.getNAR();
            if (!nar) return;

            const stats = nar.getStats();

            if (this.statusBar) {
                this.statusBar.updateStats({
                    cycles: stats.cycleCount || 0,
                    messages: 0,
                    latency: 0
                });
            }

            if (this.metricsPanel) {
                const totalConcepts = stats.memoryStats ? stats.memoryStats.totalConcepts : 0;
                const maxConcepts = (stats.config && stats.config.memory) ? stats.config.memory.maxConcepts : 1000;

                this.metricsPanel.update({
                    performance: {
                        throughput: this.isReasonerRunning ? (1000 / Math.max(this.reasonerDelay, 1)) : 0,
                        avgLatency: 0
                    },
                    resourceUsage: {
                        heapUsed: totalConcepts,
                        heapTotal: maxConcepts
                    },
                    taskProcessing: {
                        totalProcessed: stats.cycleCount,
                        successful: stats.cycleCount
                    },
                    reasoningSteps: stats.cycleCount,
                    uptime: Date.now() - (nar._startTime || Date.now())
                });
            }
        }, 500);
    }
}
