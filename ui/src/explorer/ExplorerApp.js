import { GraphPanel } from '../components/GraphPanel.js';
import { HUDContextMenu } from './HUDContextMenu.js';
import { Logger } from '../logging/Logger.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';
import { DEMOS } from '../data/demos.js';
import { StatusBar } from '../components/StatusBar.js';
import { SystemMetricsPanel } from '../components/SystemMetricsPanel.js';
import { HUDLayoutManager } from '../layout/HUDLayoutManager.js';
import { ExplorerInfoPanel } from './ExplorerInfoPanel.js';
import { ExplorerToolbar } from './ExplorerToolbar.js';
import { LogPanel } from '../components/LogPanel.js';
import { InspectorPanel } from '../components/InspectorPanel.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { ToastManager } from '../components/ToastManager.js';
import { DemoLibraryModal } from '../components/DemoLibraryModal.js';
import { TargetPanel } from './TargetPanel.js';
import { getTacticalStyle } from '../visualization/ExplorerGraphTheme.js';

export class ExplorerApp {
    constructor() {
        this.mappings = {
            size: 'priority',
            color: 'hash'
        };

        const themeStyle = getTacticalStyle(this.mappings, this._getColorFromHash.bind(this));

        // Use GraphPanel instead of ExplorerGraph
        this.graphPanel = new GraphPanel('graph-container', {
            useBag: true,
            bagCapacity: 50,
            style: themeStyle
        });

        // Context menu and other components expect a graph object with certain interface
        // We'll proxy through graphPanel.graphManager (SeNARSGraph)
        this.contextMenu = new HUDContextMenu(this.graphPanel.graphManager, this);
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
        this.infoPanel = new ExplorerInfoPanel();
        this.controlToolbar = new ExplorerToolbar();
        this.logPanel = new LogPanel();
        this.inspectorPanel = new InspectorPanel();

        // Wire up inspector save callback
        this.inspectorPanel.onSave = (id, updates) => this.saveNodeChanges(id, updates);
    }

    // Convenience accessor for the underlying graph manager
    get graph() {
        return this.graphPanel.graphManager;
    }

    async initialize() {
        console.log('ExplorerApp: Initializing...');

        this._setupHUD();

        // Init Graph
        this.graphPanel.initialize(); // GraphPanel init

        // Wait for graphManager to be ready if async
        if (!this.graph) {
             console.error("GraphPanel failed to initialize graphManager");
        } else {
             // Bind inspector
             this.graph.on('nodeClick', ({ node }) => {
                 this.showInspector({ id: node.id(), ...node.data() });
             });

             // Setup Context Menu proxy
             // SeNARSGraph emits 'contextMenu' event
             this.graph.on('contextMenu', ({ target, originalEvent }) => {
                 const type = target && target !== this.graph.cy ? (target.isNode() ? 'node' : 'edge') : 'background';
                 const evt = originalEvent;
                 if (type === 'background') {
                     this.contextMenu.show(evt.x, evt.y, null, 'background');
                 } else {
                     this.contextMenu.show(evt.x, evt.y, target, type);
                 }
             });
        }

        // Register Commands
        this._registerCommands();

        // Init Layout System
        this.layoutManager.initialize();

        // Instantiate and Mount Components
        this.layoutManager.addComponent(this.infoPanel, 'top');

        // Metrics - Mount to top region
        this.metricsPanel = new SystemMetricsPanel(null); // No static container
        this.metricsPanel.initialize();
        this.layoutManager.addComponent(this.metricsPanel, 'top');

        this.targetPanel = new TargetPanel(null); // Will be absolute
        const targetContainer = document.createElement('div');
        targetContainer.id = 'target-panel-container';
        document.body.appendChild(targetContainer);
        this.targetPanel.container = targetContainer; // Manual mount
        this.targetPanel.render();

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

    _bindControls() {
        // Some actions need translation from ExplorerGraph API to SeNARSGraph API
        const bindings = [
            { id: 'btn-fit', action: () => this.graph.fit() },
            { id: 'btn-in', action: () => this.graph.zoomIn() },
            { id: 'btn-out', action: () => this.graph.zoomOut() },
            { id: 'btn-layout', action: () => this.graph.scheduleLayout() }, // SeNARSGraph uses scheduleLayout
            { id: 'btn-clear', action: () => { this.graph.clear(); this.log('Workspace cleared.', 'system'); this._updateStats(); } },
            { id: 'btn-add-concept', action: () => this.handleAddConcept() },
            { id: 'btn-add-link', action: () => this.handleAddLink() },
            { id: 'btn-delete', action: () => this.handleDelete() },
            { id: 'btn-run', action: () => this.toggleReasoner(true) },
            { id: 'btn-pause', action: () => this.toggleReasoner(false) },
            { id: 'btn-step', action: () => this.stepReasoner() },
            { id: 'btn-llm-config', action: () => this._showLLMConfig() },
            { id: 'btn-close-inspector', action: () => document.getElementById('inspector-panel')?.classList.add('hidden') },
            { id: 'btn-save', action: () => this.handleSaveJSON() },
            { id: 'btn-load', action: () => this.handleLoadJSON() }
        ];

        bindings.forEach(({ id, action }) => this._bindClick(id, action));

        this._bindSearch();
        this._bindDemoSelect();
        this._bindModeSwitch();
        this._bindThrottleSlider();
        this._bindRepl();
        this._bindLayerToggles();
        this._bindMappingControls();
    }

    _bindSearch() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput) return;

        searchInput.oninput = (e) => {
            const term = e.target.value.trim();
            // SeNARSGraph doesn't have highlightMatches by default, but GraphViewport does.
            // SeNARSGraph extends GraphSystem which has access to cy.
            // We can implement highlightMatches here or assume it's available if we mixed it in.
            // Or use direct cy manipulation.
            if (this.graph.highlightMatches) {
                 this.graph.highlightMatches(term);
            } else {
                 // Fallback or implementation
                 this._highlightMatches(term);
            }
        };

        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const term = searchInput.value.trim();
                if (term) {
                    let foundNode;
                    if (this.graph.findNode) {
                        foundNode = this.graph.findNode(term);
                    } else {
                        foundNode = this._findNode(term);
                    }

                    if (foundNode) {
                        this.log(`Found: ${term}`, 'system');
                        this.showInspector({ id: foundNode.id(), ...foundNode.data() });
                        foundNode.select();
                    } else {
                        this.log(`Not found: ${term}`, 'warning');
                    }
                }
            }
        };
    }

    // Helpers for search if SeNARSGraph misses them
    _highlightMatches(term) {
        if (!this.graph || !this.graph.cy) return;
        this.graph.cy.batch(() => {
            const allElements = this.graph.cy.elements();
            allElements.removeClass('matched dimmed');

            if (!term || term.length < 2) return;

            const termLower = term.toLowerCase();
            const matches = allElements.filter(ele => {
                if (!ele.isNode()) return false;
                const label = (ele.data('label') || '').toLowerCase();
                return label.includes(termLower);
            });

            if (matches.nonempty()) {
                allElements.addClass('dimmed');
                matches.removeClass('dimmed').addClass('matched');
                matches.connectedEdges().removeClass('dimmed');
            }
        });
    }

    _findNode(id) {
        if (!this.graph || !this.graph.cy) return null;
        const term = id?.toLowerCase();
        let node = this.graph.cy.$id(id);

        if (node.empty() && term) {
            node = this.graph.cy.nodes().filter(n =>
                (n.data('label') || '').toLowerCase().includes(term)
            ).first();
        }

        if (node.nonempty()) {
            this.graph.cy.animate({
                center: { eles: node },
                zoom: 1.5,
                duration: 500
            });
            node.addClass('highlighted');
            setTimeout(() => node.removeClass('highlighted'), 2000);
            return node;
        }
        return null;
    }

    _bindDemoSelect() {
        const demoSelect = document.getElementById('demo-select');
        if (!demoSelect) return;

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

    _bindModeSwitch() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setMode(e.target.dataset.mode);
            };
        });
    }

    _bindThrottleSlider() {
        const slider = document.getElementById('throttle-slider');
        const label = document.getElementById('throttle-val');
        if (slider && label) {
            slider.oninput = (e) => {
                this.reasonerDelay = parseInt(e.target.value);
                label.textContent = `${this.reasonerDelay}ms`;
            };
        }
    }

    _bindRepl() {
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

    _bindLayerToggles() {
        document.querySelectorAll('input[data-layer]').forEach(input => {
            input.onchange = (e) => {
                const layer = e.target.dataset.layer;
                const visible = e.target.checked;
                // Map layer toggles to filter
                // SeNARSGraph uses applyFilters({ showTasks: bool, ... })
                if (layer === 'tasks') {
                     this.graph.applyFilters({ showTasks: visible });
                }
                // Concepts layer isn't explicitly filterable in SeNARSGraph currently, only tasks/isolated.
                // We might need to implement concept hiding if needed, but usually we just hide tasks.

                this.log(`${layer} layer ${visible ? 'visible' : 'hidden'}`, 'system');
            };
        });
    }

    _bindMappingControls() {
        const sizeSelect = document.getElementById('mapping-size');
        if (sizeSelect) {
            sizeSelect.onchange = (e) => {
                this.mappings.size = e.target.value;
                this._updateGraphStyle();
                this.log(`Size mapping: ${e.target.value}`, 'system');
            };
        }

        const colorSelect = document.getElementById('mapping-color');
        if (colorSelect) {
            colorSelect.onchange = (e) => {
                this.mappings.color = e.target.value;
                this._updateGraphStyle();
                this.log(`Color mapping: ${e.target.value}`, 'system');
            };
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

        demo.concepts.forEach(c => this.graph.addNode({ ...c, id: c.term }, false));
        // SeNARSGraph addNode takes object with id/term/budget
        // addConcept was: addConcept(term, priority, details)
        // SeNARSGraph addNode: { id, term, budget: { priority }, ...details }

        demo.relationships.forEach(r => this.graph.addEdge({ source: r[0], target: r[1], type: r[2] }, false));

        this.graph.scheduleLayout();
        this._updateStats();
    }

    showInspector(data) {
        this.inspectorPanel.update(data, this.mode);
    }

    saveNodeChanges(id, updates) {
        // SeNARSGraph uses addNode/updateNode to handle bag updates internally
        // We just need to construct the update payload
        const payload = {
            id: id,
            ...updates
            // Note: SeNARSGraph expects full data structure for deep updates,
            // but for shallow props it might be fine.
            // If bag exists, it updates bag item.
        };

        this.graph.updateNode(payload);

        this.log(`Updated node ${id}`, 'success');
        // Retrieve updated item from bag or graph to show in inspector
        const item = this.graph.bag ? this.graph.bag.get(id) : null;
        if (item) {
             this.showInspector({ id, ...item.data, ...updates });
        }
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
        this.commandPalette.registerCommand('layout', 'Re-calculate Layout', 'L', () => this.graph.scheduleLayout());

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
        // SeNARSGraph has processDecay if useBag is true
        if (this.graph.processDecay) {
            const removed = this.graph.processDecay(0.98, 0.05);
            if (removed.length > 0) {
                // _syncFromBag called internally
            }
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
        // SeNARSGraph doesn't have setMode.
        // Visualization mode in Explorer meant autoungrabify.
        // GraphSystem has boxSelectionEnabled.
        if (mode === 'visualization') {
            this.graph.cy.autoungrabify(true);
        } else {
            this.graph.cy.autoungrabify(false);
        }

        // Show/Hide Control Toolbar via CSS class, though now it's in a wrapper
        const toolbar = document.getElementById('control-toolbar');
        if (toolbar) {
            if (mode === 'control') {
                toolbar.classList.remove('hidden');
            } else {
                toolbar.classList.add('hidden');
            }
        }

        console.log(`Mode switched to: ${mode}`);
    }

    handleAddConcept() {
        const term = prompt("Enter concept name:");
        if (term) {
            // SeNARSGraph addNode: { id: term, term: term, budget: { priority: 0.5 }, type: 'concept' }
            this.graph.addNode({ id: term, term: term, budget: { priority: 0.5 }, type: 'concept' }, true);
            this.log(`Created concept: ${term}`, 'user');
        }
    }

    handleAddLink() {
        if (!this.graph.cy) return;
        const selected = this.graph.cy.$(':selected');

        if (selected.length !== 2) {
            alert("Please select exactly two nodes to link.");
            return;
        }

        const source = selected[0].id();
        const target = selected[1].id();

        const type = prompt(`Link ${source} -> ${target} as:`, 'implication');
        if (type) {
            this.graph.addEdge({ source, target, type }, true);
            this.log(`Linked ${source} -> ${target} (${type})`, 'user');
        }
    }

    handleSaveJSON() {
        if (!this.graph || !this.graph.cy) return;
        const json = this.graph.cy.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'senars-graph.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.log('Graph saved to senars-graph.json', 'system');
    }

    handleLoadJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.loadGraphData(data);
                } catch (err) {
                    this.log(`Error parsing JSON: ${err.message}`, 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    loadGraphData(json) {
        if (!this.graph || !this.graph.cy) return;

        // Handle Cytoscape JSON export format
        if (json.elements) {
            this.graph.clear();
            const nodes = json.elements.nodes || [];
            const edges = json.elements.edges || [];

            let addedNodes = 0;
            nodes.forEach(n => {
                if (this.graph.addNode(n.data, false)) addedNodes++;
            });

            let addedEdges = 0;
            edges.forEach(e => {
                if (this.graph.addEdge(e.data, false)) addedEdges++;
            });

            this.graph.scheduleLayout();
            this.log(`Loaded ${addedNodes} nodes and ${addedEdges} edges`, 'success');
            this._updateStats();
        } else {
            this.log('Invalid graph JSON format (missing "elements")', 'error');
        }
    }

    handleDelete() {
        if (!this.graph.cy) return;
        const selected = this.graph.cy.$(':selected');

        if (selected.empty()) {
            return;
        }

        if (confirm(`Delete ${selected.length} items?`)) {
            selected.forEach(ele => {
                if (ele.isNode()) {
                    if (this.graph.bag) this.graph.bag.remove(ele.id());
                    else this.graph.cy.remove(ele); // Fallback
                }

                if (ele.isEdge()) {
                    ele.remove();
                }
            });

            if (this.graph.bag) this.graph._syncFromBag();
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
