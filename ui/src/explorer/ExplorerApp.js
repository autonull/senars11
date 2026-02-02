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

        let html = '';
        for (const [key, value] of Object.entries(data)) {
            if (key === 'weight' || key === 'id') continue;

            let displayVal = value;
            if (typeof value === 'number') displayVal = value.toFixed(3);

            html += `
                <div class="prop-row">
                    <span class="prop-label">${key}</span>
                    <span class="prop-value">${displayVal}</span>
                </div>
            `;
        }

        html = `
            <div class="prop-row">
                <span class="prop-label">ID</span>
                <span class="prop-value">${data.id}</span>
            </div>
        ` + html;

        content.innerHTML = html;
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
        console.log(`Mode switched to: ${mode}`);
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
