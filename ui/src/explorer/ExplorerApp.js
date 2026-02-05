import { GraphPanel } from '../components/GraphPanel.js';
import { HUDContextMenu } from './HUDContextMenu.js';
import { Logger } from '../logging/Logger.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';
import { DEMOS } from '../data/demos.js';
import { StatusBar } from '../components/StatusBar.js';
import { SystemMetricsPanel } from '../components/SystemMetricsPanel.js';
import { HUDLayoutManager } from '../layout/HUDLayoutManager.js';
import { ExplorerInfoPanel } from './ExplorerInfoPanel.js';
import { LogPanel } from '../components/LogPanel.js';
import { InspectorPanel } from '../components/InspectorPanel.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { ToastManager } from '../components/ToastManager.js';
import { DemoLibraryModal } from '../components/DemoLibraryModal.js';
import { ShortcutsModal } from '../components/ShortcutsModal.js';
import { TargetPanel } from './TargetPanel.js';
import { getTacticalStyle } from '../visualization/ExplorerGraphTheme.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';
import { IntrospectionEvents } from '@senars/core';

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
            style: themeStyle,
            showToolbar: false
        });

        // Context menu and other components expect a graph object with certain interface
        // We'll proxy through graphPanel.graphManager (SeNARSGraph)
        this.contextMenu = null; // Will be initialized after graph is ready
        this.commandPalette = new CommandPalette();
        this.toastManager = new ToastManager();
        this.logger = new Logger();
        this.lmController = null;
        this.localToolsBridge = null;
        this.mode = 'visualization';

        this.isReasonerRunning = false;
        this.reasonerDelay = 100;
        this.reasonerLoopId = null;
        this.statusBar = null;
        this.metricsPanel = null;

        this._narEventsBound = false;
        this.isDecayEnabled = false;
        this.decayLoopId = null;

        // Layout & Panels
        this.layoutManager = new HUDLayoutManager('hud-overlay');
        this.infoPanel = new ExplorerInfoPanel();
        this.logPanel = new LogPanel();
        this.inspectorPanel = new InspectorPanel();

        // Wire up inspector callbacks
        this.inspectorPanel.onSave = (id, updates) => this.saveNodeChanges(id, updates);
        this.inspectorPanel.onQuery = (term) => this.handleReplCommand(`<${term} ?>?`);
        this.inspectorPanel.onTrace = (id) => this.graph.traceDerivationPath(id);
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
        this.contextMenu = new HUDContextMenu(this.graph, this);

        // Wait for graphManager to be ready if async
        if (!this.graph) {
            console.error("GraphPanel failed to initialize graphManager");
        } else {
            // Bind inspector
            this.graph.on('nodeClick', ({ node }) => {
                const data = node.data();

                // Extract simple links for inspector
                const links = node.connectedEdges().map(edge => {
                     const target = edge.target();
                     const source = edge.source();
                     return target.id() === node.id() ? source.id() : target.id();
                }).slice(0, 5); // Limit to 5

                // Merge fullData to top level for inspector so it sees budget/truth
                this.showInspector({
                    id: node.id(),
                    links: links,
                    ...data,
                    ...(data.fullData || {})
                });
            });

            // Double-click to focus
            this.graph.on('nodeDblClick', ({ node }) => {
                if (this.graph.cy) {
                    this.graph.cy.animate({
                        center: { eles: node },
                        zoom: 1.5,
                        duration: 500
                    });
                    this.log(`Focused: ${node.id()}`, 'system');
                }
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

        // === NEW DOCKING SYSTEM: Create temporary containers for  widgets ===
        // Widgets will set their own IDs and classes during render()

        // 1. Layers Widget (left) - ExplorerInfoPanel
        const layersContainer = document.createElement('div');
        this.infoPanel.container = layersContainer;
        this.infoPanel.render();
        this.layoutManager.registerWidget('layers', layersContainer, 'left', true);

        // 2. Metrics Widget (right, top) - SystemMetricsPanel
        const metricsContainer = document.createElement('div');
        this.metricsPanel = new SystemMetricsPanel(null);
        this.metricsPanel.container = metricsContainer;
        this.metricsPanel.initialize();
        this.metricsPanel.render();
        this.layoutManager.registerWidget('metrics', metricsContainer, 'right', true);

        // 3. Log Widget (right, bottom) - LogPanel
        const logContainer = document.createElement('div');
        this.logPanel.container = logContainer;
        this.logPanel.render();
        this.layoutManager.registerWidget('log', logContainer, 'right', true);

        // 4. Inspector Widget (left, bottom) - InspectorPanel
        const inspectorContainer = document.createElement('div');
        this.inspectorPanel.container = inspectorContainer;
        this.inspectorPanel.render();
        this.layoutManager.registerWidget('inspector', inspectorContainer, 'left', false);

        // 6. Target Panel (absolute positioned, not docked)
        this.targetPanel = new TargetPanel(null);
        const targetContainer = document.createElement('div');
        targetContainer.id = 'target-panel-container';
        document.body.appendChild(targetContainer);
        this.targetPanel.container = targetContainer;
        this.targetPanel.render();

        // Init Components (StatusBar with unified controls)
        this.statusBar = new StatusBar('status-bar-container');
        this.statusBar.initialize({
            onModeSwitch: () => console.log('Mode Switch'),
            onThemeToggle: () => this._toggleTheme(),
            onReasonerControl: (action, value) => this.handleReasonerControl(action, value),
            onReplSubmit: (command) => this.handleReplCommand(command),
            onWidgetToggle: (widgetId) => this.toggleWidget(widgetId),
            onConfig: () => this._showLLMConfig(),
            onMenuAction: (action) => this.handleMenuAction(action)
        });

        // Start stats update loop
        this._startStatsLoop();

        // Init UI Bindings
        this._bindControls();
        this._bindDragDrop();
        this._bindKeyboardShortcuts();

        // Dynamic import of LLM Controller
        try {
            const module = await import('../agent/LMAgentController.js');
            this.lmController = new module.LMAgentController(this.logger);
            this._setupLMEvents();

            try {
                await this.lmController.initialize();
                this._updateLLMStatus('Ready', 'ready');
                this._bindNAREvents();
            } catch (e) {
                console.warn('LLM init failed (might need config):', e);
                // If LLM init fails, check if we have tools bridge (NAR) access
                if (!this.lmController.toolsBridge) {
                    await this._initLocalBridge();
                    this._updateLLMStatus('Config Required (Local)', 'warning');
                } else {
                    this._updateLLMStatus('Config Required', 'warning');
                }
            }
        } catch (e) {
            console.error('Failed to load LMAgentController module:', e);
            // Fallback to local reasoner
            await this._initLocalBridge();

            if (this.localToolsBridge) {
                this._updateLLMStatus('Reasoner Only', 'warning');
                this.toastManager.show('LLM unavailable - Running in Reasoner Only mode', 'info');
            } else {
                const errorMsg = e.message || String(e);
                this._updateLLMStatus('Module Error', 'error');
                this.log(`Failed to load LMAgentController: ${errorMsg}`, 'error');
                this.toastManager.show(`Module Error: ${errorMsg}`, 'error');
            }
        }

        console.log('ExplorerApp: Initialized');

        // Show welcome toast
        setTimeout(() => {
            this.toastManager.show('Welcome! Press "?" for keyboard shortcuts.', 'info', 5000);
        }, 1000);
    }

    async _initLocalBridge() {
        try {
            const module = await import('../agent/AgentToolsBridge.js');
            this.localToolsBridge = new module.AgentToolsBridge();
            await this.localToolsBridge.initialize();
            this.log('Local Reasoner initialized successfully', 'system');
            this._bindNAREvents();
        } catch (e) {
            console.error('Failed to load AgentToolsBridge:', e);
            this.log('Failed to load local reasoner', 'error');
        }
    }

    _getNAR() {
        if (this.lmController && this.lmController.toolsBridge && this.lmController.toolsBridge.getNAR()) {
            return this.lmController.toolsBridge.getNAR();
        }
        if (this.localToolsBridge) {
            return this.localToolsBridge.getNAR();
        }
        return null;
    }

    _bindNAREvents() {
        const nar = this._getNAR();
        if (!nar || this._narEventsBound) return;

        // Enable tracing to ensure we get derivation events
        if (nar.hasOwnProperty('traceEnabled')) {
            nar.traceEnabled = true;
        }

        // Bind to TASK_ADDED to visualize new concepts/tasks entering the system
        if (nar.on) {
            nar.on(IntrospectionEvents.TASK_ADDED, (data) => {
                console.log('ExplorerApp: TASK_ADDED event received', data);
                this.log(`INPUT: ${data.task.term}`, 'user');
                this._onTaskAdded(data.task);
            });

            // Bind to REASONING_DERIVATION for derived results
            nar.on(IntrospectionEvents.REASONING_DERIVATION, (data) => {
                console.log('ExplorerApp: REASONING_DERIVATION event received', data);
                this.log(`DERIVED: ${data.derivedTask.term} (${data.inferenceRule})`, 'system');

                this._onDerivation(data);

                // Animate reasoning trace
                const sourceId = data.task?.term?.toString();
                const beliefId = data.belief?.term?.toString();
                const derivedId = data.derivedTask?.term?.toString();

                if (this.graph && this.graph.animateReasoning) {
                     this.graph.animateReasoning(sourceId, beliefId, derivedId);
                }
            });

            nar.on(IntrospectionEvents.TASK_ERROR, (data) => {
                console.error('ExplorerApp: TASK_ERROR event received', data);
                this.log(`ERROR: ${data.error}`, 'error');
            });

            this._narEventsBound = true;
            console.log('ExplorerApp: Bound to NAR events');
        }
    }

    _onDerivation(data) {
        const { task, belief, derivedTask, inferenceRule } = data;

        // Enrich derived task with derivation metadata for Inspector
        const derivedId = derivedTask.term.toString();
        const sources = [];
        if (task?.term) sources.push(task.term.toString());
        if (belief?.term) sources.push(belief.term.toString());

        derivedTask.derivation = {
            rule: inferenceRule || 'Inference',
            sources: sources
        };

        // Ensure derived task node exists
        this._onTaskAdded(derivedTask);
        const rule = inferenceRule || 'Inference';

        // Add derivation edges
        if (task && task.term) {
            const sourceId = task.term.toString();
            // Ensure source node exists (might be just an ID ref if not in bag, but we try)
            if (this.graph.cy.$id(sourceId).empty()) {
                this._onTaskAdded(task);
            }

            this.graph.addEdge({
                source: sourceId,
                target: derivedId,
                type: 'derivation',
                label: rule
            }, false);
        }

        if (belief && belief.term) {
            const beliefId = belief.term.toString();
             if (this.graph.cy.$id(beliefId).empty()) {
                this._onTaskAdded(belief);
            }

            this.graph.addEdge({
                source: beliefId,
                target: derivedId,
                type: 'derivation',
                label: rule
            }, false);
        }

        if (this.graph.scheduleLayout) {
             // Debounced layout in real app, but direct here
             // this.graph.scheduleLayout();
        }
    }

    _onTaskAdded(task) {
        if (!task || !task.term) return;

        const term = task.term.toString();
        console.log(`ExplorerApp: Adding node for term: ${term}`);
        const budget = task.budget || { priority: 0.5 };

        // Add Node
        this.graph.addNode({
             id: term,
             term: term,
             budget: budget,
             type: 'concept'
        }, false);

        if (this.graph.animateAttention) {
            this.graph.animateAttention(term);
        }

        // Simple relation extraction for visualization
        // Handle Prefix: (--> , source , target)
        if (term.startsWith('(-->')) {
             const parts = term.replace(/^\(-->\s*,?\s*|\)$/g, '').split(',').map(s => s.trim());
             if (parts.length >= 2) {
                 const source = parts[0];
                 const target = parts[1];

                 this.graph.addNode({ id: source, term: source }, false);
                 this.graph.addNode({ id: target, term: target }, false);

                 this.graph.addEdge({
                     source, target, type: 'inheritance'
                 }, false);
             }
        }
        // Handle Infix: <source --> target>
        else if (term.includes('-->')) {
             const parts = term.replace(/[<>]/g, '').split('-->');
             if (parts.length === 2) {
                 const source = parts[0].trim();
                 const target = parts[1].trim();

                 // Ensure source/target nodes exist
                 this.graph.addNode({ id: source, term: source }, false);
                 this.graph.addNode({ id: target, term: target }, false);

                 this.graph.addEdge({
                     source, target, type: 'inheritance'
                 }, false);
             }
        }

        // Request layout update to ensure new nodes are positioned correctly
        if (this.graph.scheduleLayout) {
            // Debounce or throttle could be added here if high frequency,
            // but for now direct call ensures responsiveness for demonstration.
            this.graph.scheduleLayout();
        }
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

    _showShortcuts() {
        new ShortcutsModal().show();
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
            { id: 'btn-close-inspector', action: () => document.getElementById('inspector-panel')?.classList.add('hidden') },
            { id: 'btn-save', action: () => this.handleSaveJSON() },
            { id: 'btn-load', action: () => this.handleLoadJSON() },
            { id: 'btn-shortcuts', action: () => this._showShortcuts() }
        ];

        bindings.forEach(({ id, action }) => this._bindClick(id, action));

        this._bindSearch();
        this._bindDemoSelect();
        this._bindModeSwitch();
        this._bindLayerToggles();
        this._bindMappingControls();
        this._bindLayoutControls();
        // Note: REPL and reasoner controls now in StatusBar
    }

    _bindLayoutControls() {
        const layoutSelect = document.getElementById('layout-select');
        if (layoutSelect) {
            layoutSelect.onchange = (e) => {
                const layout = e.target.value;
                if (layout === 'scatter') {
                    // Default scatter args or prompt? Using defaults for now.
                    if (this.graph.applyScatterLayout) {
                        this.graph.applyScatterLayout('priority', 'confidence');
                    }
                } else if (layout === 'sorted-grid') {
                    if (this.graph.applySortedGridLayout) {
                        this.graph.applySortedGridLayout('priority');
                    }
                } else {
                    if (this.graph.setLayout) {
                        this.graph.setLayout(layout);
                    }
                }
                this.log(`Layout switched to: ${layout}`, 'system');
            };
        }

        const isolatedCheck = document.getElementById('check-isolated');
        if (isolatedCheck) {
            isolatedCheck.onchange = (e) => {
                const hide = e.target.checked;
                this.graph.applyFilters({ hideIsolated: hide });
                this.log(`Isolated nodes ${hide ? 'hidden' : 'shown'}`, 'system');
            };
        }

        const prioSlider = document.getElementById('filter-priority');
        const prioVal = document.getElementById('prio-val');
        if (prioSlider) {
            prioSlider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                if (prioVal) prioVal.textContent = val.toFixed(2);
                this.graph.applyFilters({ minPriority: val });
            };
        }
    }

    _bindSearch() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput) return;

        const clearBtn = document.getElementById('btn-clear-search');

        searchInput.oninput = (e) => {
            const term = e.target.value.trim();
            if (clearBtn) clearBtn.style.display = term ? 'block' : 'none';

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

        if (clearBtn) {
            clearBtn.onclick = () => {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
                searchInput.focus();
            };
        }

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

    // Reasoner control handler for StatusBar
    handleReasonerControl(action, value) {
        switch (action) {
            case 'run':
                this.toggleReasoner(true);
                break;
            case 'pause':
                this.toggleReasoner(false);
                break;
            case 'step':
                this.stepReasoner();
                break;
            case 'throttle':
                this.reasonerDelay = value;
                break;
        }
    }

    handleMenuAction(action) {
        switch (action) {
            case 'save':
                this.handleSaveJSON();
                break;
            case 'load':
                this.handleLoadJSON();
                break;
            case 'add-concept':
                this.handleAddConcept();
                break;
            case 'add-link':
                this.handleAddLink();
                break;
            case 'delete':
                this.handleDelete();
                break;
            case 'fit':
                this.graph.fit();
                break;
            case 'layout':
                this.graph.scheduleLayout();
                break;
            case 'clear':
                this.graph.clear();
                this.log('Workspace cleared.', 'system');
                this._updateStats();
                break;
            case 'shortcuts':
                this._showShortcuts();
                break;
            default:
                console.warn('Unknown menu action:', action);
        }
    }

    /**
     * Toggle HUD widget visibility
     * @param {string} widgetId - Widget identifier (layers, metrics, log, inspector)
     * @returns {boolean} New visibility state
     */
    toggleWidget(widgetId) {
        const result = this.layoutManager.toggle(widgetId);
        // toggle returns false if widget not found, or boolean new state
        // But if it returns false when hidden (false), it's ambiguous.
        // We rely on getWidget to confirm.

        const widget = this.layoutManager.getWidget(widgetId);
        if (widget) {
            const isVisible = !widget.classList.contains('hidden');
            this.log(`${widgetId} widget ${isVisible ? 'shown' : 'hidden'}`, 'system');

            if (isVisible) {
                widget.classList.add('active-widget');
            } else {
                widget.classList.remove('active-widget');
            }
            return isVisible;
        }
        return false;
    }

    _bindLayerToggles() {
        document.querySelectorAll('input[data-layer]').forEach(input => {
            input.onchange = (e) => {
                const layer = e.target.dataset.layer;
                const visible = e.target.checked;

                if (layer === 'tasks') {
                    this.graph.applyFilters({ showTasks: visible });
                } else if (layer === 'concepts') {
                     // We interpret "hide concepts" as hiding non-tasks or hiding everything?
                     // Let's assume hiding concept nodes.
                     this.graph.applyFilters({ showConcepts: visible });
                } else if (layer === 'trace') {
                     // Toggle trace visibility or mode
                     if (visible) {
                        this.graph.cy.elements().addClass('trace-dim');
                        // Highlight recent traces?
                     } else {
                        this.graph.cy.elements().removeClass('trace-dim trace-highlight');
                     }
                }

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
        // Fetch existing data to merge
        let existing = {};
        if (this.graph.bag && this.graph.bag.get(id)) {
            existing = this.graph.bag.get(id).data;
        } else if (this.graph.cy) {
            const node = this.graph.cy.$id(id);
            if (node.nonempty()) {
                existing = node.data('fullData') || node.data();
            }
        }

        const payload = this._deepMerge(existing, updates);

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
        // Redundant with _startStatsLoop, but kept for immediate feedback
        // Just clear the old legacy direct manipulation if it exists
        // The real update happens in _startStatsLoop targeting the InfoPanel
    }

    async handleReplCommand(command) {
        this.log(`> ${command}`, 'user');

        if (command === '/clear') {
            document.getElementById('log-content').innerHTML = '';
            return;
        }
        if (command === '/help') {
            this.log('Available commands: /clear, /help, !code (MeTTa), <narsese>', 'system');
            return;
        }

        // MeTTa Code Execution
        if (command.startsWith('!')) {
            const code = command.substring(1).trim();
            this.log(`Executing MeTTa: ${code}`, 'system');

            // Try via LM Controller bridge if available, else local
            let bridge = this.localToolsBridge;
            if (this.lmController && this.lmController.toolsBridge) {
                bridge = this.lmController.toolsBridge;
            }

            if (bridge && bridge.hasTool('run_metta')) {
                try {
                    const result = await bridge.executeTool('run_metta', { code });
                    if (result.success) {
                        this.log(result.data, 'success');
                    } else {
                        this.log(`MeTTa Error: ${result.error}`, 'error');
                    }
                } catch (e) {
                    this.log(`Execution Error: ${e.message}`, 'error');
                }
            } else {
                this.log('MeTTa interpreter not available.', 'error');
            }
            return;
        }

        // JSON Input Handling
        if (command.startsWith('{') && command.endsWith('}')) {
            try {
                const data = JSON.parse(command);
                this.log('Processing JSON input...', 'system');
                if (data.term || data.id) {
                    this.graph.updateNode(data);
                    this.log(`Updated node: ${data.term || data.id}`, 'success');
                } else if (data.source && data.target) {
                    this.graph.addEdge(data, true);
                    this.log(`Added edge: ${data.source} -> ${data.target}`, 'success');
                } else {
                    this.log('JSON must contain "term"/"id" for nodes or "source"/"target" for edges.', 'warning');
                }
            } catch (e) {
                this.log(`Invalid JSON: ${e.message}`, 'error');
            }
            return;
        }

        // Direct Narsese input detection (e.g. <A --> B>.)
        const isNarsese = (command.startsWith('<') || command.startsWith('(')) &&
                          (command.endsWith('.') || command.endsWith('?') || command.endsWith('!'));

        // If we are offline/Local Mode OR the input is clearly Narsese, bypass LLM
        const useLocal = !this.lmController || !this.lmController.isInitialized || isNarsese;

        if (useLocal) {
             const nar = this._getNAR();
             if (nar) {
                 try {
                     nar.input(command);
                     this.log(`Input to NAR: ${command}`, 'system');
                     // If it was a query, we might want to see result immediately if synchronous,
                     // but loop handles stats/updates.
                 } catch (e) {
                     this.log(`NAR Error: ${e.message}`, 'error');
                 }
             } else {
                 this.log('Agent offline and no Local Reasoner available.', 'error');
             }
             return;
        }

        if (this.lmController && this.lmController.isInitialized) {
            try {
                const response = await this.lmController.chat(command);
                this.log(response, 'agent');
            } catch (e) {
                this.log(`Error: ${e.message}`, 'error');
            }
        }
    }

    log(message, type = 'info') {
        // Use the new LogPanel API if available
        if (this.logPanel && this.logPanel.addLog) {
            this.logPanel.addLog(message, type);
        } else {
            // Fallback
            console.log(`[${type.toUpperCase()}] ${message}`);
        }

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
        const toolbarWidget = document.getElementById('controls-widget');

        if (mode === 'control') {
            if (toolbar) toolbar.classList.remove('hidden');
            if (toolbarWidget) toolbarWidget.classList.remove('hidden');
        } else {
            if (toolbar) toolbar.classList.add('hidden');
            if (toolbarWidget) toolbarWidget.classList.add('hidden');
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
            this.loadFile(file);
        };
        input.click();
    }

    loadFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.loadGraphData(data);
                this.log(`Loaded file: ${file.name}`, 'system');
            } catch (err) {
                this.log(`Error parsing JSON: ${err.message}`, 'error');
            }
        };
        reader.readAsText(file);
    }

    _bindDragDrop() {
        const container = document.body;

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.add('dragging-over');
        });

        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove('dragging-over');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove('dragging-over');

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];

                // Route file based on extension
                if (file.name.endsWith('.json')) {
                    this.loadFile(file);
                } else if (file.name.endsWith('.metta')) {
                    this.loadMeTTaFile(file);
                } else if (file.name.endsWith('.nal') || file.name.endsWith('.nars')) {
                    this.loadNALFile(file);
                } else {
                    this.log(`Unsupported file type: ${file.name}`, 'warning');
                }
            }
        });
    }

    loadMeTTaFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const code = e.target.result;
            this.log(`Loading MeTTa file: ${file.name}`, 'system');
            await this.handleReplCommand(`!${code}`);
        };
        reader.readAsText(file);
    }

    loadNALFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            this.log(`Loading NAL file: ${file.name}`, 'system');
            const lines = content.split('\n');
            let count = 0;
            lines.forEach(line => {
                const trim = line.trim();
                if (trim && !trim.startsWith('//') && !trim.startsWith(';')) {
                    // Send to REPL/NAR
                    // We bypass handleReplCommand to avoid async flood if we want bulk
                    // But for simplicity reuse it or direct NAR input
                    const nar = this._getNAR();
                    if (nar) {
                        try { nar.input(trim); count++; } catch (e) { /* ignore parse errs */ }
                    }
                }
            });
            this.log(`Processed ${count} NAL lines`, 'success');
        };
        reader.readAsText(file);
    }

    _bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Shortcuts valid even when focused in input
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                this.toggleWidget('layers');
                this.toggleWidget('inspector');
                return;
            }

            if (e.key === 'F1') {
                e.preventDefault();
                this.commandPalette.toggle();
                return;
            }

            // Ignore subsequent shortcuts if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                document.getElementById('log-content').innerHTML = '';
                this.log('Log cleared', 'system');
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                const search = document.getElementById('search-input');
                if (search) search.focus();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                this.handleDelete();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.handleSaveJSON();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                this.handleLoadJSON();
            } else if (e.key === ' ') {
                e.preventDefault(); // Prevent scroll
                this.toggleReasoner(!this.isReasonerRunning);
            } else if (e.key === '?') {
                e.preventDefault();
                this._showShortcuts();
            }
        });
    }

    _toggleTheme() {
        const body = document.body;
        if (body.classList.contains('light-theme')) {
            body.classList.remove('light-theme');
            this.log('Switched to Dark Theme', 'system');
        } else {
            body.classList.add('light-theme');
            this.log('Switched to Light Theme', 'system');
        }
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
            const nodeIds = [];
            selected.forEach(ele => {
                if (ele.isNode()) {
                    nodeIds.push(ele.id());
                } else if (ele.isEdge()) {
                    ele.remove();
                }
            });

            if (nodeIds.length > 0) {
                if (this.graph.removeNodes) {
                    this.graph.removeNodes(nodeIds);
                } else {
                    // Fallback
                    nodeIds.forEach(id => {
                        if (this.graph.removeNode) {
                            this.graph.removeNode(id);
                        } else {
                            if (this.graph.bag) this.graph.bag.remove(id);
                            else {
                                const node = this.graph.cy.getElementById(id);
                                if (node.nonempty()) this.graph.cy.remove(node);
                            }
                        }
                    });
                    if (this.graph.bag && !this.graph.removeNode) this.graph._syncFromBag();
                }
            }

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

        // Update StatusBar
        if (this.statusBar) {
            this.statusBar.setReasonerRunning(run);
        }

        if (run) {
            this._runReasonerLoop();
            this.log('Reasoner started', 'system');
        } else {
            if (this.reasonerLoopId) {
                clearTimeout(this.reasonerLoopId);
                this.reasonerLoopId = null;
            }
            this.log('Reasoner paused', 'system');
        }
    }

    async stepReasoner() {
        const nar = this._getNAR();
        if (!nar) {
            this.log('Reasoner not available (LLM not connected?)', 'warning');
            return;
        }

        try {
            await nar.step();
            // Optional: Debug log to console (not UI log) to verify loop is running
            // console.log('ExplorerApp: step completed');
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

    _deepMerge(target, source) {
        const isObject = (item) => (item && typeof item === 'object' && !Array.isArray(item));
        const output = Object.assign({}, target);

        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target))
                        Object.assign(output, { [key]: source[key] });
                    else
                        output[key] = this._deepMerge(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    _startStatsLoop() {
        setInterval(() => {
            const nar = this._getNAR();
            if (!nar) return;

            const stats = nar.getStats();
            const memoryStats = stats.memoryStats || {};
            const totalConcepts = memoryStats.conceptCount || memoryStats.totalConcepts || (memoryStats.memoryUsage ? memoryStats.memoryUsage.concepts : 0);
            const maxConcepts = (stats.config && stats.config.memory) ? stats.config.memory.maxConcepts : 1000;
            const tps = this.isReasonerRunning ? (1000 / Math.max(this.reasonerDelay, 1)).toFixed(1) : 0;

            // Update StatusBar and InfoPanel
            // Get active (visible) nodes from graph if available
            const activeNodes = (this.graph && this.graph.cy) ? this.graph.cy.nodes().length : 0;
            const statsPayload = {
                cycles: stats.cycleCount || 0,
                nodes: totalConcepts,
                activeNodes: activeNodes,
                maxNodes: maxConcepts,
                tps: tps
            };

            if (this.statusBar) {
                this.statusBar.updateStats(statsPayload);
            }

            if (this.infoPanel && this.infoPanel.updateStats) {
                this.infoPanel.updateStats(statsPayload);
            }

            // Legacy status bar support
            const legacyBar = this.statusBar;
            if (legacyBar && legacyBar.updateStats) {
                legacyBar.updateStats({
                    cycles: stats.cycleCount || 0,
                    messages: 0,
                    latency: 0
                });
            }

            // Update metrics panel
            if (this.metricsPanel) {
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
