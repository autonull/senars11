import { ExplorerGraph } from './ExplorerGraph.js';
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

export class ExplorerApp {
    constructor() {
        this.graph = new ExplorerGraph('graph-container');
        this.logger = new Logger();
        this.lmController = null;
        this.mode = 'visualization';

        this.isReasonerRunning = false;
        this.reasonerDelay = 100;
        this.reasonerLoopId = null;
        this.statusBar = null;
        this.metricsPanel = null;

        // Layout & Panels
        this.layoutManager = new HUDLayoutManager('hud-overlay');
        this.infoPanel = new InfoPanel();
        this.controlToolbar = new ControlToolbar();
        this.logPanel = new LogPanel();
        this.inspectorPanel = new InspectorPanel();
    }

    async initialize() {
        console.log('ExplorerApp: Initializing...');

        // Init Graph
        await this.graph.initialize();
        this.loadDemo('Solar System');

        this.graph.onNodeTap((data) => this.showInspector(data));

        // Init Layout System
        this.layoutManager.initialize();

        // Instantiate and Mount Components
        this.infoPanel.mount();
        this.layoutManager.addComponent(this.infoPanel, 'top');

        // Metrics - Mount to top region
        this.metricsPanel = new SystemMetricsPanel(null); // No static container
        this.metricsPanel.initialize();
        this.metricsPanel.mount(); // prepare
        this.layoutManager.addComponent(this.metricsPanel, 'top');

        this.controlToolbar.mount();
        this.layoutManager.addComponent(this.controlToolbar, 'bottom');

        this.logPanel.mount();
        this.layoutManager.addComponent(this.logPanel, 'left');

        this.inspectorPanel.mount();
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

        // Demo Select
        const demoSelect = document.getElementById('demo-select');
        if (demoSelect) {
            Object.keys(DEMOS).forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                demoSelect.appendChild(opt);
            });

            demoSelect.onchange = (e) => {
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

        demo.concepts.forEach(c => this.graph.addConcept(c.term, c.priority, { type: c.type }));
        demo.relationships.forEach(r => this.graph.addRelationship(r[0], r[1], r[2]));

        this.graph.relayout();
        this._updateStats();
    }

    showInspector(data) {
        const panel = document.getElementById('inspector-panel');
        const content = document.getElementById('inspector-content');
        if (!panel || !content) return;

        panel.classList.remove('hidden');

        let html = `
            <div class="prop-row">
                <span class="prop-label">ID</span>
                <span class="prop-value">${data.id}</span>
            </div>
        `;

        const isControl = (this.mode === 'control');

        for (const [key, value] of Object.entries(data)) {
            if (key === 'weight' || key === 'id') continue;

            let displayVal = value;
            if (typeof value === 'number') displayVal = value.toFixed(3);

            if (isControl) {
                html += `
                    <div class="prop-row">
                        <span class="prop-label">${key}</span>
                        <input type="text" class="prop-input" id="insp-input-${key}" value="${value}" />
                    </div>
                `;
            } else {
                html += `
                    <div class="prop-row">
                        <span class="prop-label">${key}</span>
                        <span class="prop-value">${displayVal}</span>
                    </div>
                `;
            }
        }

        if (isControl) {
            html += `
                <div style="margin-top: 10px; text-align: right;">
                    <button id="btn-inspector-save" class="btn small-btn">Save</button>
                </div>
            `;
        }

        content.innerHTML = html;

        if (isControl) {
            this._bindClick('btn-inspector-save', () => this.saveNodeChanges(data.id));
        }
    }

    saveNodeChanges(id) {
        const inputs = document.querySelectorAll('#inspector-content .prop-input');
        const updates = {};

        inputs.forEach(input => {
            const key = input.id.replace('insp-input-', '');
            let value = input.value;

            // Attempt to parse numbers
            if (!isNaN(parseFloat(value)) && isFinite(value)) {
                value = parseFloat(value);
            }

            updates[key] = value;
        });

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

        this.log(`Updated node ${id}`, 'user');
        this.showInspector({ id, ...updates });
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

        entry.innerHTML = `<span style="color:#666">[${timestamp}]</span> <span style="color:${color}">${message}</span>`;

        logPanel.appendChild(entry);
        logPanel.scrollTop = logPanel.scrollHeight;
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
