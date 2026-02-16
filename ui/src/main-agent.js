/**
 * @file main-agent.js
 * @description Entry point for Agent REPL with WebLLM integration
 */

import { NotebookPanel } from './components/NotebookPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { Logger } from './logging/Logger.js';
import { LMAgentController } from './agent/LMAgentController.js';
import { AgentConnectionManager } from './connection/AgentConnectionManager.js';

class AgentREPL {
    constructor() {
        this.logger = new Logger();
        this.statusBar = null;
        this.notebookPanel = null;
        this.lmController = null;
        this.connection = null;
        this.isInitialized = false;

        // Status display helper
        this.updateStatus = (message, isError = false) => {
            const statusEl = document.getElementById('loading-progress');
            const textEl = document.querySelector('.loading-text');

            console.log(`[AgentREPL] ${message}`);

            if (statusEl) {
                statusEl.textContent = message;
                if (isError) {
                    statusEl.style.color = '#ff6b6b';
                }
            }
            if (textEl && isError) {
                textEl.textContent = 'Error';
                textEl.style.color = '#ff6b6b';
            }
        };
    }

    async initialize() {
        try {
            this.updateStatus('Step 1/6: Loading modules...');
            this.logger.log('Initializing Agent REPL...', 'system');

            // Initialize UI components
            this.updateStatus('Step 2/6: Creating UI components...');
            this.statusBar = new StatusBar(document.getElementById('status-bar-root'));
            this.statusBar.initialize({
                onModeSwitch: () => this.showInfo()
            });
            this.statusBar.updateMode('Agent');
            this.statusBar.updateStatus('Initializing...');

            // Create notebook panel container
            this.updateStatus('Step 3/6: Setting up notebook panel...');
            const container = document.getElementById('agent-container');
            const notebookContainer = document.createElement('div');
            notebookContainer.style.flex = '1';
            notebookContainer.style.overflow = 'auto';
            container.appendChild(notebookContainer);

            this.notebookPanel = new NotebookPanel(notebookContainer);
            this.notebookPanel.initialize(this);

            // Show welcome message
            this.updateStatus('Step 4/6: Displaying welcome message...');
            this.showWelcomeMessage();

            // Initialize LM controller
            this.updateStatus('Step 5/6: Initializing WebLLM (this may download ~1GB model)...');
            this.lmController = new LMAgentController(this.logger);

            // Set up progress tracking
            this.lmController.on('model-load-start', (data) => {
                this.updateStatus(`Loading model: ${data.modelName}...`);
                this.notebookPanel.notebookManager.createResultCell(
                    `📥 Starting model download: ${data.modelName}`,
                    'system'
                );
            });

            this.lmController.on('model-dl-progress', (data) => {
                const percent = Math.round(data.progress * 100);
                this.updateStatus(`Downloading model: ${percent}% - ${data.text || ''}`);

                // Update notebook every 10%
                if (percent % 10 === 0) {
                    this.notebookPanel.notebookManager.createResultCell(
                        `📥 Download progress: ${percent}%`,
                        'system'
                    );
                }
            });

            this.lmController.on('model-load-complete', (data) => {
                this.updateStatus('✅ Model loaded successfully!');
                this.hideLoading();
                this.notebookPanel.notebookManager.createResultCell(
                    `✅ WebLLM model loaded! (took ${Math.round(data.elapsedMs / 1000)}s)`,
                    'system'
                );
                this.notebookPanel.notebookManager.createResultCell(
                    `🎯 Ready for interaction! Available tools: ${this.lmController.getAvailableTools().length}`,
                    'system'
                );
                this.statusBar.updateStatus('Ready');
            });

            this.lmController.on('model-load-error', (data) => {
                const errorMsg = `❌ Error loading model: ${data.error}`;
                this.updateStatus(errorMsg, true);
                this.hideLoading();
                this.notebookPanel.notebookManager.createResultCell(errorMsg, 'system');
                this.statusBar.updateStatus('Error');
            });

            // Initialize the LM
            console.log('[AgentREPL] Starting LM controller initialization...');
            await this.lmController.initialize();
            console.log('[AgentREPL] LM controller initialized, awaiting model load...');

            // Create connection manager that routes through LM
            this.updateStatus('Step 6/6: Setting up agent connection...');
            this.connection = new AgentConnectionManager(this.lmController, this.logger);
            await this.connection.connect();

            this.isInitialized = true;
            this.logger.log('Agent REPL initialized successfully', 'success');
            console.log('[AgentREPL] ✅ Full initialization complete');

        } catch (error) {
            const errorMsg = `❌ Initialization failed: ${error.message}`;
            console.error('[AgentREPL] ERROR:', error);
            this.updateStatus(errorMsg, true);
            this.logger.log(errorMsg, 'error');
            this.hideLoading();

            if (this.notebookPanel) {
                this.notebookPanel.notebookManager.createResultCell(
                    `${errorMsg}\n\nStack trace:\n${error.stack}`,
                    'system'
                );
            }

            this.statusBar?.updateStatus('Error');
        }
    }

    showWelcomeMessage() {
        const welcomeMarkdown = `# 🤖 Welcome to SeNARS Agent REPL

This is an experimental agentic interface powered by **WebLLM** running entirely in your browser.

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

**Note**: First run will download the model (~1GB). This happens once and is cached for offline use.

---

**Status**: Initializing... (check console for detailed progress)
`;

        this.notebookPanel.notebookManager.createMarkdownCell(welcomeMarkdown);
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    showInfo() {
        const info = `
Agent REPL Mode
Provider: WebLLM (Offline)
Model: ${this.lmController?.modelName || 'Not loaded'}
Status: ${this.isInitialized ? 'Ready' : 'Initializing'}
        `.trim();
        alert(info);
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

        // Display error in UI
        const statusEl = document.getElementById('loading-progress');
        if (statusEl) {
            statusEl.textContent = `Fatal error: ${error.message}`;
            statusEl.style.color = '#ff6b6b';
        }
    }
}

console.log('[Main] DOMContentLoaded - registering start handler');
window.addEventListener('DOMContentLoaded', start);
