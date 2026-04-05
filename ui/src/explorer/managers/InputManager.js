import { CommandRegistry } from './CommandRegistry.js';
import { DemoManager } from './DemoManager.js';
import { KeybindManager } from './KeybindManager.js';

export class InputManager {
    constructor(app) {
        this.app = app;
        this.commandPalette = app.commandPalette;
        this._commandRegistry = new CommandRegistry(app);
        this._demoManager = new DemoManager(app);
        this._keybindManager = new KeybindManager(app, this._commandRegistry);
        app._inputManager = this;
    }

    initialize() {
        this._commandRegistry.registerAll();
        this._bindSearch();
        this._demoManager.bindDemoSelect();
        this._bindModeSwitch();
        this._bindLayerToggles();
        this._bindMappingControls();
        this._bindLayoutControls();
        this._keybindManager.initialize();
    }

    // Delegate to CommandRegistry
    handleAddConcept(pos) { this._commandRegistry.handleAddConcept(pos); }
    handleAddLink() { this._commandRegistry.handleAddLink(); }
    handleDelete() { this._commandRegistry.handleDelete(); }
    toggleDecay(force) { this._commandRegistry.toggleDecay(force); }
    setMode(mode) { this._commandRegistry.setMode(mode); }
    showDemoLibrary() { this._demoManager.showDemoLibrary(); }
    loadDemo(name) { this._demoManager.loadDemo(name); }
    handleMenuAction(action) { this._commandRegistry.handleMenuAction(action); }

    async handleReplCommand(command) {
        if (!command) {return;}
        this.app.log(`> ${command}`, 'user');
        if (command.startsWith('!')) {
            const code = command.slice(1);
            if (this.app.localToolsBridge) {
                const res = await this.app.localToolsBridge.executeTool('run_metta', { code });
                if (res.success) {this.app.log(`MeTTa Result: ${res.data}`, 'success');}
                else {this.app.log(`MeTTa Error: ${res.error}`, 'error');}
            } else {this.app.log('MeTTa bridge not available', 'error');}
            return;
        }
        const nar = this.app.reasoningManager._getNAR();
        if (nar) {
            try { nar.input(command); }
            catch (e) { this.app.log(`NAL Error: ${e.message}`, 'error'); }
        } else {this.app.log('Reasoner not available', 'error');}
    }

    _bindSearch() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput) {return;}
        const clearBtn = document.getElementById('btn-clear-search');

        searchInput.oninput = (e) => {
            const term = e.target.value.trim();
            if (clearBtn) {clearBtn.style.display = term ? 'block' : 'none';}
            if (this.app.graph.highlightMatches) {this.app.graph.highlightMatches(term);}
            else {this._highlightMatches(term);}
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
                    const foundNode = this.app.graph.findNode?.(term) ?? this._findNode(term);
                    if (foundNode) {
                        this.app.log(`Found: ${term}`, 'system');
                        this.app.showInspector({ id: foundNode.id(), ...foundNode.data() });
                        foundNode.select();
                    } else {this.app.log(`Not found: ${term}`, 'warning');}
                }
            }
        };
    }

    _highlightMatches(term) {
        if (!this.app.graph?.cy) {return;}
        this.app.graph.cy.batch(() => {
            const allElements = this.app.graph.cy.elements();
            allElements.removeClass('matched dimmed');
            if (!term || term.length < 2) {return;}
            const termLower = term.toLowerCase();
            const matches = allElements.filter(ele => ele.isNode() && (ele.data('label') || '').toLowerCase().includes(termLower));
            if (matches.nonempty()) {
                allElements.addClass('dimmed');
                matches.removeClass('dimmed').addClass('matched');
                matches.connectedEdges().removeClass('dimmed');
            }
        });
    }

    _findNode(id) {
        if (!this.app.graph?.cy) {return null;}
        const term = id?.toLowerCase();
        let node = this.app.graph.cy.$id(id);
        if (node.empty() && term) {
            node = this.app.graph.cy.nodes().filter(n => (n.data('label') || '').toLowerCase().includes(term)).first();
        }
        if (node.nonempty()) {
            this.app.graph.cy.animate({ center: { eles: node }, zoom: 1.5, duration: 500 });
            node.addClass('highlighted');
            setTimeout(() => node.removeClass('highlighted'), 2000);
            return node;
        }
        return null;
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
                const {layer} = e.target.dataset;
                const visible = e.target.checked;
                const filters = {
                    'tasks': { showTasks: visible },
                    'concepts': { showConcepts: visible },
                    'trace': visible ? {} : {}
                };
                if (layer === 'trace') {
                    this.app.graph.cy.elements().classList.toggle('trace-dim', visible);
                    if (!visible) {this.app.graph.cy.elements().removeClass('trace-dim trace-highlight');}
                } else if (filters[layer]) {
                    this.app.graph.applyFilters(filters[layer]);
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
                if (layout === 'scatter') {this.app.graph.applyScatterLayout?.('priority', 'confidence');}
                else if (layout === 'sorted-grid') {this.app.graph.applySortedGridLayout?.('priority');}
                else {this.app.graph.setLayout?.(layout);}
                this.app.log(`Layout switched to: ${layout}`, 'system');
            };
        }
        const isolatedCheck = document.getElementById('check-isolated');
        if (isolatedCheck) {
            isolatedCheck.onchange = (e) => {
                this.app.graph.applyFilters({ hideIsolated: e.target.checked });
                this.app.log(`Isolated nodes ${e.target.checked ? 'hidden' : 'shown'}`, 'system');
            };
        }
        const prioSlider = document.getElementById('filter-priority');
        const prioVal = document.getElementById('prio-val');
        if (prioSlider) {
            prioSlider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                if (prioVal) {prioVal.textContent = val.toFixed(2);}
                this.app.graph.applyFilters({ minPriority: val });
            };
        }
        const freezeCheck = document.getElementById('check-freeze-layout');
        if (freezeCheck) {
            freezeCheck.onchange = (e) => {
                this.app.graph.setUpdatesEnabled(!e.target.checked);
                this.app.log(`Layout ${e.target.checked ? 'Frozen' : 'Active'}`, 'system');
            };
        }
    }
}
