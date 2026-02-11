import { ExplorerGraph } from './ExplorerGraph.js';
import { Logger } from '../logging/Logger.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';
import { DEMOS } from './demos.js';

export class ExplorerApp {
    constructor() {
        this.graph = new ExplorerGraph('graph-container');
        this.logger = new Logger();
        this.lmController = null;
        this.mode = 'visualization';
    }

    async initialize() {
        console.log('ExplorerApp: Initializing...');

        // Init Graph
        await this.graph.initialize();
        this.loadDemo('Solar System');

        this.graph.onNodeTap((data) => this.showInspector(data));

        // Init UI Bindings
        this._bindControls();

        // Dynamic import
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
        document.getElementById('btn-fit').onclick = () => this.graph.fit();
        document.getElementById('btn-in').onclick = () => this.graph.zoomIn();
        document.getElementById('btn-out').onclick = () => this.graph.zoomOut();
        document.getElementById('btn-layout').onclick = () => this.graph.relayout();

        // Data Controls
        document.getElementById('btn-clear').onclick = () => {
            this.graph.clear();
            this.log('Cleared workspace.', 'system');
            this._updateStats();
        };

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

        const demoSelect = document.getElementById('demo-select');
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

        document.getElementById('btn-close-inspector').onclick = () => {
            document.getElementById('inspector-panel').classList.add('hidden');
        };

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setMode(e.target.dataset.mode);
            };
        });

        // Gardening Tools
        document.getElementById('btn-add-concept').onclick = () => this.handleAddConcept();
        document.getElementById('btn-add-link').onclick = () => this.handleAddLink();
        document.getElementById('btn-delete').onclick = () => this.handleDelete();

        document.getElementById('btn-llm-config').onclick = () => {
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
        };

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
            document.getElementById('btn-inspector-save').onclick = () => this.saveNodeChanges(data.id);
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
            this.graph.bag.items.set(id, item); // Trigger re-set might not be needed if reference is same, but good for safety
        }

        // Update Graph Node
        const cyNode = this.graph.viewport.cy.$id(id);
        if (cyNode && cyNode.length > 0) {
            cyNode.data(updates);
            // Re-style if needed (e.g. priority might change size)
            // But usually styles are mapped to data automatically if using mappers
        }

        this.log(`Updated node ${id}`, 'user');
        this.showInspector({ id, ...updates }); // Refresh inspector
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

        // Show/Hide Control Toolbar
        const toolbar = document.getElementById('control-toolbar');
        if (mode === 'control') {
            toolbar.classList.remove('hidden');
        } else {
            toolbar.classList.add('hidden');
        }

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
                // Edges are removed automatically by Cytoscape when nodes are removed,
                // but if we are just deleting an edge, we might need to handle it.
                // However, our sync logic relies on the Bag.
                // If we delete a node from Bag, sync removes it.
                // If we delete an edge... we don't have edges in Bag currently.
                // Our edges are just visual or derived.
                // For this mock, we will just remove from Cytoscape directly for edges,
                // and from Bag for nodes.

                if (ele.isEdge()) {
                    ele.remove();
                }
            });

            // Re-sync to ensure consistency
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
}
