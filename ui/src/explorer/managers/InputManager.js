import { DEMOS } from '../../data/demos.js';
import { ShortcutsModal } from '../../components/ShortcutsModal.js';
import { DemoLibraryModal } from '../../components/DemoLibraryModal.js';

export class InputManager {
    constructor(app) {
        this.app = app;
        this.commandPalette = app.commandPalette;
    }

    initialize() {
        this._registerCommands();
        this._bindControls();
        this._bindSearch();
        this._bindDemoSelect();
        this._bindModeSwitch();
        this._bindLayerToggles();
        this._bindMappingControls();
        this._bindLayoutControls();
        this._bindKeyboardShortcuts();
    }

    _registerCommands() {
        // Navigation
        this.commandPalette.registerCommand('fit', 'Fit View to Graph', 'F', () => this.app.graph.fit(), 'Navigation');
        this.commandPalette.registerCommand('zoom-in', 'Zoom In', '+', () => this.app.graph.zoomIn(), 'Navigation');
        this.commandPalette.registerCommand('zoom-out', 'Zoom Out', '-', () => this.app.graph.zoomOut(), 'Navigation');
        this.commandPalette.registerCommand('layout', 'Re-calculate Layout', 'L', () => this.app.graph.scheduleLayout(), 'Navigation');
        this.commandPalette.registerCommand('go-back', 'Go Back (History)', 'Esc', () => this.app.graph.goBack?.(), 'Navigation');

        // Data
        this.commandPalette.registerCommand('clear', 'Clear Workspace', null, () => {
            this.app.graph.clear();
            this.app.log('Workspace cleared', 'system');
        }, 'Data');

        this.commandPalette.registerCommand('add-concept', 'Add New Concept', 'A', () => this.handleAddConcept(), 'Data');
        this.commandPalette.registerCommand('link', 'Link Selected Nodes', null, () => this.handleAddLink(), 'Data');
        this.commandPalette.registerCommand('delete', 'Delete Selected', 'Del', () => this.handleDelete(), 'Data');

        // File
        this.commandPalette.registerCommand('save', 'Save Graph (JSON)', 'Ctrl+S', () => this.app.fileManager.handleSaveJSON(), 'File');
        this.commandPalette.registerCommand('load', 'Load Graph (JSON)', 'Ctrl+O', () => this.app.fileManager.handleLoadJSON(), 'File');
        this.commandPalette.registerCommand('import-csv', 'Import Graph (CSV)', null, () => this.app.fileManager.handleImportCSV(), 'File');
        this.commandPalette.registerCommand('export-png', 'Export PNG', null, () => this.app.fileManager.handleExportImage('png'), 'File');
        this.commandPalette.registerCommand('export-svg', 'Export SVG', null, () => this.app.fileManager.handleExportImage('svg'), 'File');

        // Attention / Decay
        this.commandPalette.registerCommand('toggle-decay', 'Toggle Attention Decay', null, () => this.toggleDecay(), 'System');

        // Reasoner
        this.commandPalette.registerCommand('run', 'Run Reasoner', 'Space', () => this.app.toggleReasoner(!this.app.isReasonerRunning), 'System');
        this.commandPalette.registerCommand('step', 'Step Reasoner', 'S', () => this.app.stepReasoner(), 'System');

        // UI
        this.commandPalette.registerCommand('mode-vis', 'Switch to Visualization Mode', null, () => this.setMode('visualization'), 'View');
        this.commandPalette.registerCommand('mode-ctl', 'Switch to Control Mode', null, () => this.setMode('control'), 'View');
        this.commandPalette.registerCommand('toggle-focus', 'Toggle Focus Mode', null, () => this.app.toggleFocusMode(), 'View');
        this.commandPalette.registerCommand('toggle-fullscreen', 'Toggle Fullscreen', null, () => this.app.handleToggleFullscreen(), 'View');

        // Panels
        const togglePanel = (id) => {
            this.app.toggleWidget(id);
        };

        this.commandPalette.registerCommand('toggle-layers', 'Toggle Layers Panel', null, () => togglePanel('layers'), 'View');
        this.commandPalette.registerCommand('toggle-metrics', 'Toggle Metrics Panel', null, () => togglePanel('metrics'), 'View');
        this.commandPalette.registerCommand('toggle-log', 'Toggle Log Panel', null, () => togglePanel('log'), 'View');
        this.commandPalette.registerCommand('toggle-inspector', 'Toggle Inspector Panel', null, () => togglePanel('inspector'), 'View');
        this.commandPalette.registerCommand('toggle-tasks', 'Toggle Task Browser', null, () => togglePanel('tasks'), 'View');

        // Demos
        this.commandPalette.registerCommand('demos', 'Browse Demo Library', 'D', () => this.showDemoLibrary(), 'Demos');

        Object.keys(DEMOS).forEach(name => {
            this.commandPalette.registerCommand(`demo-${name.toLowerCase().replace(/\s/g, '-')}`, `Load Demo: ${name}`, null, () => this.loadDemo(name), 'Demos');
        });
    }

    _bindControls() {
        const bindings = [
            { id: 'btn-fit', action: () => this.app.graph.fit() },
            { id: 'btn-in', action: () => this.app.graph.zoomIn() },
            { id: 'btn-out', action: () => this.app.graph.zoomOut() },
            { id: 'btn-layout', action: () => this.app.graph.scheduleLayout() },
            { id: 'btn-clear', action: () => { this.app.graph.clear(); this.app.log('Workspace cleared.', 'system'); this._updateStats(); } },
            { id: 'btn-add-concept', action: () => this.handleAddConcept() },
            { id: 'btn-add-link', action: () => this.handleAddLink() },
            { id: 'btn-delete', action: () => this.handleDelete() },
            { id: 'btn-close-inspector', action: () => document.getElementById('inspector-panel')?.classList.add('hidden') },
            { id: 'btn-save', action: () => this.app.fileManager.handleSaveJSON() },
            { id: 'btn-load', action: () => this.app.fileManager.handleLoadJSON() },
            { id: 'btn-shortcuts', action: () => new ShortcutsModal().show() }
        ];

        bindings.forEach(({ id, action }) => this._bindClick(id, action));
    }

    // --- Core Logic Methods ---

    handleAddConcept(position = null) {
        const input = prompt("Enter concept name (or type:name):");
        if (input) {
            let term = input.trim();
            let type = 'concept';

            const colonIndex = term.indexOf(':');
            if (colonIndex > 0) {
                 type = term.substring(0, colonIndex).trim();
                 term = term.substring(colonIndex + 1).trim();
            }

            if (!term) {
                 this.app.log("Invalid concept name.", "warning");
                 return;
            }

            this.app.graph.addNode({
                id: term,
                term: term,
                budget: { priority: 0.5 },
                type: type,
                position: position
            }, true);
            this.app.log(`Created ${type}: ${term}`, 'success');
        }
    }

    handleAddLink() {
        if (!this.app.graph.cy) return;
        const selected = this.app.graph.cy.$(':selected');

        if (selected.length !== 2) {
            alert("Please select exactly two nodes to link.");
            return;
        }

        const source = selected[0].id();
        const target = selected[1].id();

        const type = prompt(`Link ${source} -> ${target} as:`, 'implication');
        if (type) {
            this.app.graph.addEdge({ source, target, type }, true);
            this.app.log(`Linked ${source} -> ${target} (${type})`, 'user');
        }
    }

    handleDelete() {
        if (!this.app.graph.cy) return;
        const selected = this.app.graph.cy.$(':selected');

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
                if (this.app.graph.removeNodes) {
                    this.app.graph.removeNodes(nodeIds);
                } else {
                    nodeIds.forEach(id => {
                        if (this.app.graph.removeNode) {
                            this.app.graph.removeNode(id);
                        } else {
                            if (this.app.graph.bag) this.app.graph.bag.remove(id);
                            else {
                                const node = this.app.graph.cy.getElementById(id);
                                if (node.nonempty()) this.app.graph.cy.remove(node);
                            }
                        }
                    });
                    if (this.app.graph.bag && !this.app.graph.removeNode) this.app.graph._syncFromBag();
                }
            }

            this.app.log(`Deleted ${selected.length} items.`, 'user');
            this._updateStats();
        }
    }

    toggleDecay(forceState) {
        this.app.isDecayEnabled = forceState !== undefined ? forceState : !this.app.isDecayEnabled;

        if (this.app.isDecayEnabled) {
            this.app.log('Attention Decay: ON', 'system');
            this.app.decayLoopId = setInterval(() => this._processDecay(), 1000);
        } else {
            this.app.log('Attention Decay: OFF', 'system');
            clearInterval(this.app.decayLoopId);
        }
    }

    setMode(mode) {
        this.app.mode = mode;
        if (mode === 'visualization') {
            this.app.graph.cy.autoungrabify(true);
        } else {
            this.app.graph.cy.autoungrabify(false);
        }

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

    loadDemo(name) {
        const demo = DEMOS[name];
        if (!demo) return;

        this.app.graph.clear();
        this.app.log(`Loading demo: ${name}`, 'system');

        if (demo.bagCapacity && this.app.graph.bag) {
            this.app.graph.bag.capacity = demo.bagCapacity;
            this.app.log(`Set Bag Capacity to ${demo.bagCapacity}`, 'system');
        }

        if (demo.script) {
            this.app.toastManager.show(`Running Script: ${name}`, 'info');
            this._runDemoScript(name, demo.script);
        } else if (demo.generator) {
            this.app.toastManager.show(`Generating: ${name}`, 'info');
            try {
                demo.generator(this.app.graph);
                this.app.graph.scheduleLayout();
                this.app.toastManager.show(`Generated: ${name}`, 'success');
            } catch (e) {
                this.app.log(`Generator Error: ${e.message}`, 'error');
            }
        } else {
            this.app.toastManager.show(`Demo loaded: ${name}`, 'success');
            demo.concepts.forEach(c => this.app.graph.addNode({ ...c, id: c.term }, false));
            demo.relationships.forEach(r => this.app.graph.addEdge({ source: r[0], target: r[1], type: r[2] }, false));
            this.app.graph.scheduleLayout();
        }

        this._updateStats();
    }

    async _runDemoScript(name, script) {
        for (const line of script) {
            await this.app.handleReplCommand(line);
            await new Promise(r => setTimeout(r, 800));
        }
        this.app.toastManager.show(`Script completed: ${name}`, 'success');
    }

    showDemoLibrary() {
        const modal = new DemoLibraryModal({
            onSelect: (selection) => {
                if (typeof selection === 'string') {
                    this.loadDemo(selection);
                } else if (selection && selection.path) {
                    this.app.fileManager.loadRemoteFile(selection.path);
                }
            }
        });
        modal.show();
    }

    _processDecay() {
        if (this.app.graph.processDecay) {
            const removed = this.app.graph.processDecay(0.98, 0.05);
        }
        this._updateStats();
    }

    _updateStats() {
        // Triggered by loop mostly, but here for manual updates
    }

    handleMenuAction(action) {
        switch (action) {
            case 'save':
                this.app.fileManager.handleSaveJSON();
                break;
            case 'load':
                this.app.fileManager.handleLoadJSON();
                break;
            case 'import-csv':
                this.app.fileManager.handleImportCSV();
                break;
            case 'export-png':
                this.app.fileManager.handleExportImage('png');
                break;
            case 'export-svg':
                this.app.fileManager.handleExportImage('svg');
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
                this.app.graph.fit();
                break;
            case 'layout':
                this.app.graph.scheduleLayout();
                break;
            case 'focus-mode':
                this.app.toggleFocusMode();
                break;
            case 'fullscreen':
                this.app.handleToggleFullscreen();
                break;
            case 'clear':
                this.app.graph.clear();
                this.app.log('Workspace cleared.', 'system');
                this._updateStats();
                break;
            case 'shortcuts':
                new ShortcutsModal().show();
                break;
            default:
                console.warn('Unknown menu action:', action);
        }
    }

    // --- Helpers ---

    _bindClick(id, handler) {
        const el = document.getElementById(id);
        if (el) el.onclick = handler;
    }

    _bindSearch() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput) return;

        const clearBtn = document.getElementById('btn-clear-search');

        searchInput.oninput = (e) => {
            const term = e.target.value.trim();
            if (clearBtn) clearBtn.style.display = term ? 'block' : 'none';

            if (this.app.graph.highlightMatches) {
                this.app.graph.highlightMatches(term);
            } else {
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
                    if (this.app.graph.findNode) {
                        foundNode = this.app.graph.findNode(term);
                    } else {
                        foundNode = this._findNode(term);
                    }

                    if (foundNode) {
                        this.app.log(`Found: ${term}`, 'system');
                        this.app.showInspector({ id: foundNode.id(), ...foundNode.data() });
                        foundNode.select();
                    } else {
                        this.app.log(`Not found: ${term}`, 'warning');
                    }
                }
            }
        };
    }

    _highlightMatches(term) {
        if (!this.app.graph || !this.app.graph.cy) return;
        this.app.graph.cy.batch(() => {
            const allElements = this.app.graph.cy.elements();
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
        if (!this.app.graph || !this.app.graph.cy) return null;
        const term = id?.toLowerCase();
        let node = this.app.graph.cy.$id(id);

        if (node.empty() && term) {
            node = this.app.graph.cy.nodes().filter(n =>
                (n.data('label') || '').toLowerCase().includes(term)
            ).first();
        }

        if (node.nonempty()) {
            this.app.graph.cy.animate({
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

    _bindLayerToggles() {
        document.querySelectorAll('input[data-layer]').forEach(input => {
            input.onchange = (e) => {
                const layer = e.target.dataset.layer;
                const visible = e.target.checked;

                if (layer === 'tasks') {
                    this.app.graph.applyFilters({ showTasks: visible });
                } else if (layer === 'concepts') {
                     this.app.graph.applyFilters({ showConcepts: visible });
                } else if (layer === 'trace') {
                     if (visible) {
                        this.app.graph.cy.elements().addClass('trace-dim');
                     } else {
                        this.app.graph.cy.elements().removeClass('trace-dim trace-highlight');
                     }
                }

                this.app.log(`${layer} layer ${visible ? 'visible' : 'hidden'}`, 'system');
            };
        });
    }

    _bindMappingControls() {
        const sizeSelect = document.getElementById('mapping-size');
        if (sizeSelect) {
            sizeSelect.onchange = (e) => {
                this.app.mappings.size = e.target.value;
                this.app._updateGraphStyle();
                this.app.log(`Size mapping: ${e.target.value}`, 'system');
            };
        }

        const colorSelect = document.getElementById('mapping-color');
        if (colorSelect) {
            colorSelect.onchange = (e) => {
                this.app.mappings.color = e.target.value;
                this.app._updateGraphStyle();
                this.app.log(`Color mapping: ${e.target.value}`, 'system');
            };
        }
    }

    _bindLayoutControls() {
        const layoutSelect = document.getElementById('layout-select');
        if (layoutSelect) {
            layoutSelect.onchange = (e) => {
                const layout = e.target.value;
                if (layout === 'scatter') {
                    if (this.app.graph.applyScatterLayout) {
                        this.app.graph.applyScatterLayout('priority', 'confidence');
                    }
                } else if (layout === 'sorted-grid') {
                    if (this.app.graph.applySortedGridLayout) {
                        this.app.graph.applySortedGridLayout('priority');
                    }
                } else {
                    if (this.app.graph.setLayout) {
                        this.app.graph.setLayout(layout);
                    }
                }
                this.app.log(`Layout switched to: ${layout}`, 'system');
            };
        }

        const isolatedCheck = document.getElementById('check-isolated');
        if (isolatedCheck) {
            isolatedCheck.onchange = (e) => {
                const hide = e.target.checked;
                this.app.graph.applyFilters({ hideIsolated: hide });
                this.app.log(`Isolated nodes ${hide ? 'hidden' : 'shown'}`, 'system');
            };
        }

        const prioSlider = document.getElementById('filter-priority');
        const prioVal = document.getElementById('prio-val');
        if (prioSlider) {
            prioSlider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                if (prioVal) prioVal.textContent = val.toFixed(2);
                this.app.graph.applyFilters({ minPriority: val });
            };
        }

        const freezeCheck = document.getElementById('check-freeze-layout');
        if (freezeCheck) {
            freezeCheck.onchange = (e) => {
                const frozen = e.target.checked;
                this.app.graph.setUpdatesEnabled(!frozen);
                this.app.log(`Layout ${frozen ? 'Frozen' : 'Active'}`, 'system');
            };
        }
    }

    _bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Shortcuts valid even when focused in input
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                this.app.toggleWidget('layers');
                this.app.toggleWidget('inspector');
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

            if (e.key === 'Escape') {
                this.app.graph.goBack?.();
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                document.getElementById('log-content').innerHTML = '';
                this.app.log('Log cleared', 'system');
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                const search = document.getElementById('search-input');
                if (search) search.focus();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                this.handleDelete();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.app.fileManager.handleSaveJSON();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                this.app.fileManager.handleLoadJSON();
            } else if (e.key === ' ') {
                e.preventDefault(); // Prevent scroll
                this.app.toggleReasoner(!this.app.isReasonerRunning);
            } else if (e.key === '?') {
                e.preventDefault();
                new ShortcutsModal().show();
            }
        });
    }
}
