/**
 * @file main-agent.js
 * @description Entry point for Agent REPL with WebLLM integration
 */

import { NotebookPanel } from './components/NotebookPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { Logger } from './logging/Logger.js';
import { LMAgentController } from './agent/LMAgentController.js';
import { AgentConnectionManager } from './connection/AgentConnectionManager.js';
import { LMConfigDialog } from './agent/LMConfigDialog.js';

const UI_IDS = {
    LOADING_PROGRESS: 'loading-progress',
    LOADING_TEXT: '.loading-text',
    STATUS_BAR_ROOT: 'status-bar-root',
    AGENT_CONTAINER: 'agent-container',
    LOADING_OVERLAY: 'loading-overlay'
};

class AgentUIController {
    constructor() {
        this.overlay = document.getElementById(UI_IDS.LOADING_OVERLAY);
        this.statusEl = document.getElementById(UI_IDS.LOADING_PROGRESS);
        this.textEl = document.querySelector(UI_IDS.LOADING_TEXT);
        this.container = document.getElementById(UI_IDS.AGENT_CONTAINER);
    }

    updateStatus(message, isError = false) {
        if (this.statusEl) {
            this.statusEl.textContent = message;
            this.statusEl.style.color = isError ? '#ff6b6b' : '';
        }
        if (this.textEl && isError) {
            this.textEl.textContent = 'Error';
            this.textEl.style.color = '#ff6b6b';
        }
    }

    hideLoading() {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
    }

    createNotebookContainer() {
        const notebookContainer = document.createElement('div');
        notebookContainer.style.flex = '1';
        notebookContainer.style.overflow = 'auto';
        if (this.container) {
            this.container.appendChild(notebookContainer);
        }
        return notebookContainer;
    }

    showError(error) {
        this.updateStatus(`Fatal error: ${error.message}`, true);
    }
}

class AgentREPL {
    constructor() {
        this.logger = new Logger();
        this.ui = new AgentUIController();
        this.statusBar = null;
        this.notebookPanel = null;
        this.lmController = null;
        this.connection = null;
        this.isInitialized = false;
        this.configDialog = null;
    }

    log(message, type = 'info') {
        this.logger.log(message, type);
    }

    updateStatus(message, isError = false) {
        console.log(`[AgentREPL] ${message}`);
        this.ui.updateStatus(message, isError);
    }

    async initialize() {
        try {
            this.updateStatus('Step 1/6: Loading modules...');
            this.log('Initializing Agent REPL...', 'system');

            await this._initializeUI();
            await this._initializeLogic();

            this.isInitialized = true;
            this.log('Agent REPL initialized successfully', 'success');
            console.log('[AgentREPL] ✅ Full initialization complete');

        } catch (error) {
            this._handleInitError(error);
        }
    }

    async _initializeUI() {
        this.updateStatus('Step 2/6: Creating UI components...');
        this.statusBar = new StatusBar(document.getElementById(UI_IDS.STATUS_BAR_ROOT));
        this.statusBar.initialize({
            onModeSwitch: () => this.showConfigDialog()
        });
        this.statusBar.updateMode('Agent');
        this.statusBar.updateStatus('Initializing...');

        this.updateStatus('Step 3/6: Setting up notebook panel...');
        const notebookContainer = this.ui.createNotebookContainer();
        this.notebookPanel = new NotebookPanel(notebookContainer);
        this.notebookPanel.initialize(this);

        this.updateStatus('Step 4/6: Displaying welcome message...');
        this.showWelcomeMessage();
    }

    async _initializeLogic() {
        this.updateStatus('Step 5/6: Initializing Language Model...');
        this.lmController = new LMAgentController(this.logger);
        this._setupLMEvents();

        this.log('[AgentREPL] Starting LM controller initialization...');
        await this.lmController.initialize();
        this.log('[AgentREPL] LM controller initialized, awaiting model load...');

        this.updateStatus('Step 6/6: Setting up agent connection...');
        this.connection = new AgentConnectionManager(this.lmController, this.logger);
        await this.connection.connect();
    }

    _setupLMEvents() {
        this.lmController.on('model-load-start', (data) => {
            this.updateStatus(`Loading model: ${data.modelName}...`);
            this.notebookPanel.notebookManager.createResultCell(
                `📥 Starting model download: ${data.modelName}`, 'system'
            );
        });

        this.lmController.on('model-dl-progress', (data) => {
            const percent = Math.round(data.progress * 100);
            this.updateStatus(`Downloading model: ${percent}% - ${data.text || ''}`);
            if (percent % 10 === 0) {
                this.notebookPanel.notebookManager.createResultCell(
                    `📥 Download progress: ${percent}%`, 'system'
                );
            }
        });

        this.lmController.on('model-load-complete', (data) => {
            this.updateStatus('✅ Model loaded successfully!');
            this.ui.hideLoading();
            this.notebookPanel.notebookManager.createResultCell(
                `✅ Model loaded: ${data.modelName} (took ${Math.round(data.elapsedMs / 1000)}s)`, 'system'
            );
            this.notebookPanel.notebookManager.createResultCell(
                `🎯 Ready for interaction! Available tools: ${this.lmController.getAvailableTools().length}`, 'system'
            );
            this.statusBar.updateStatus('Ready');
        });

        this.lmController.on('model-load-error', (data) => {
            const errorMsg = `❌ Error loading model: ${data.error}`;
            this.updateStatus(errorMsg, true);
            this.ui.hideLoading();
            this.notebookPanel.notebookManager.createResultCell(errorMsg, 'system');
            this.statusBar.updateStatus('Error');
        });
    }

    _handleInitError(error) {
        const errorMsg = `❌ Initialization failed: ${error.message}`;
        console.error('[AgentREPL] ERROR:', error);
        this.updateStatus(errorMsg, true);
        this.log(errorMsg, 'error');
        this.ui.hideLoading();

        this.notebookPanel?.notebookManager.createResultCell(
            `${errorMsg}\n\nStack trace:\n${error.stack}`, 'system'
        );

        this.statusBar?.updateStatus('Error');
    }

    showWelcomeMessage() {
        const welcomeMarkdown = `# 🤖 Welcome to SeNARS Agent REPL

This is an experimental agentic interface powered by **Language Models** running entirely in your browser (default) or via API.

## 🎯 Capabilities

- **🧠 Offline LM**: Uses WebLLM for local language model inference (no server required)
- **🛠️ Agent Tools**: Integrated tools for system control and introspection
- **🔧 Self-Configuration**: Adjust NAR parameters through natural language
- **💻 Self-Programming**: Generate and execute MeTTa code
- **📊 System Control**: Query beliefs, add knowledge, manage goals

## 🚀 Getting Started

Try asking:
- \`"What tools do you have available?"\`
- \`"What are the current beliefs in the system?"\`
- \`"Can you explain what you can do?"\`

**Note**: First run will download the model (~1GB) if using WebLLM. This happens once and is cached for offline use.

---

**Status**: Initializing... (check console for detailed progress)
`;

        this.notebookPanel.notebookManager.createMarkdownCell(welcomeMarkdown);
    }

    showConfigDialog() {
        if (!this.configDialog) {
            this.configDialog = new LMConfigDialog(null, {
                onSave: async (newConfig) => {
                    this.log('Reconfiguring Language Model...', 'system');
                    try {
                        await this.lmController.reconfigure(newConfig);
                        this.log('Language Model reconfigured successfully', 'success');
                    } catch (e) {
                        this.log(`Reconfiguration failed: ${e.message}`, 'error');
                    }
                }
            });
        }
        this.configDialog.show();
    }

    getNotebook() {
        return this.notebookPanel?.notebookManager;
    }
}

async function start() {
    console.log('[Main] Starting Agent REPL initialization...');
    console.log('[Main] Current location:', window.location.href);

    try {
        const agent = new AgentREPL();
        window.AgentREPL = agent;
        await agent.initialize();
    } catch (error) {
        console.error('[Main] Failed to start Agent REPL:', error);

        // Try to show error in UI if possible, using a temporary UI controller
        try {
            new AgentUIController().showError(error);
        } catch (e) {
            // If even that fails, we are in trouble
        }
    }
}

console.log('[Main] DOMContentLoaded - registering start handler');
window.addEventListener('DOMContentLoaded', start);
