import { ExplorerGraph } from './ExplorerGraph.js';
import { Logger } from '../logging/Logger.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';

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
        this._setupGraphDemoData();

        // Init UI Bindings
        this._bindControls();

        // Dynamic import LMAgentController to avoid hard dependency crashes in raw ESM
        try {
            const module = await import('../agent/LMAgentController.js');
            this.lmController = new module.LMAgentController(this.logger);
            this._setupLMEvents();

            // Try to init LLM if config exists
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
        // Zoom/Fit
        document.getElementById('btn-fit').onclick = () => this.graph.fit();
        document.getElementById('btn-in').onclick = () => this.graph.zoomIn();
        document.getElementById('btn-out').onclick = () => this.graph.zoomOut();
        document.getElementById('btn-layout').onclick = () => this.graph.relayout();

        // Modes
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.onclick = (e) => {
                // UI update
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Logic update
                this.setMode(e.target.dataset.mode);
            };
        });

        // LLM Config
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

        // REPL Input
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

    async handleReplCommand(command) {
        this.log(`> ${command}`, 'user');

        // Simple local commands
        if (command === '/clear') {
            document.getElementById('log-content').innerHTML = '';
            return;
        }
        if (command === '/help') {
            this.log('Available commands: /clear, /help', 'system');
            return;
        }

        // Send to LLM/Agent if available
        if (this.lmController) {
            try {
                // If it's a Narsese task, we might want to inject it directly.
                // For now, treat everything as chat/instruction to the agent.
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

    _setupGraphDemoData() {
        // Core Concepts
        const concepts = [
            { term: 'Self', priority: 0.95, type: 'concept' },
            { term: 'World', priority: 0.9, type: 'concept' },
            { term: 'Bird', priority: 0.85, type: 'concept' },
            { term: 'Animal', priority: 0.8, type: 'concept' },
            { term: 'Cat', priority: 0.8, type: 'concept' },
            { term: 'Dog', priority: 0.8, type: 'concept' },
            { term: 'Fire', priority: 0.7, type: 'concept' },
            { term: 'Smoke', priority: 0.7, type: 'concept' }
        ];

        concepts.forEach(c => this.graph.addConcept(c.term, c.priority, { type: c.type }));

        // Relationships
        this.graph.addRelationship('Bird', 'Animal', 'inheritance');
        this.graph.addRelationship('Cat', 'Dog', 'similarity');
        this.graph.addRelationship('Smoke', 'Fire', 'implication');
        this.graph.addRelationship('Self', 'World', 'equivalence');

        // Random nodes for Bag pressure
        for (let i = 0; i < 40; i++) {
            this.graph.addConcept(`Noise_${i}`, Math.random() * 0.5, { type: Math.random() > 0.5 ? 'concept' : 'task' });
        }

        this.graph.relayout();
    }
}
