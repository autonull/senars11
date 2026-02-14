import { Logger } from './logging/Logger.js';
import { LocalConnectionManager } from './connection/LocalConnectionManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { CommandProcessor } from './command/CommandProcessor.js';
import { MessageRouter } from './messaging/MessageRouter.js';
import { CodeEditorPanel } from './components/CodeEditorPanel.js';
import { SimpleOutputPanel } from './components/SimpleOutputPanel.js';
import { eventBus } from './core/EventBus.js';

class SimpleEditorApp {
    constructor() {
        this.logger = new Logger();
        this.components = new Map();

        // Setup Connection (Default to Local)
        const manager = new LocalConnectionManager();
        this.connection = new ConnectionManager(manager);

        // Setup Message Router
        this.messageRouter = new MessageRouter(this); // Pass 'this' as app

        // Setup Command Processor
        // graphManager is null for now as we don't have a graph view
        this.commandProcessor = new CommandProcessor(this.connection, this.logger, null);

        this.cycleCount = 0;
        this.messageCount = 0;
        this.isRunning = false;

        // Initialize Components
        this.outputPanel = new SimpleOutputPanel(document.getElementById('output-container'));
        this.editorPanel = new CodeEditorPanel(document.getElementById('editor-container'));

        // Register output panel as 'notebook' for CodeEditorPanel compatibility
        // The outputPanel implements the necessary notebookManager methods
        this.components.set('notebook', { notebookManager: this.outputPanel });
        this.components.set('simple-output', this.outputPanel);
        this.components.set('code-editor', this.editorPanel);

        // Connect Logger to Output Panel
        this.logger.logViewer = this.outputPanel;
    }

    async initialize() {
        this.outputPanel.render();
        this.editorPanel.initialize(this); // Pass app

        // Connect to backend
        try {
            await this.connection.connect();
            this.logger.log('Connected to Local Node', 'success', '🚀');

            this.connection.subscribe('*', (message) => {
                this.messageRouter.handleMessage(message);
            });

            this.connection.subscribe('connection.status', (status) => {
                this.logger.log(`Connection Status: ${status}`, 'info');
            });

        } catch (e) {
            this.logger.log(`Failed to connect: ${e.message}`, 'error');
        }

        // Global Error Handling
        window.addEventListener('error', (e) => {
            this.logger.log(e.message, 'error');
        });

        this.logger.log('Simple Editor Initialized.', 'info');
        this.logger.log('Type code on the left (e.g. `!(+ 1 1)`) and press "Run" or Shift+Enter.', 'info', '💡');
    }

    // Required by MessageRouter
    getNotebook() {
        return this.outputPanel;
    }

    updateStats() {
        // Minimal stats update if needed
    }
}

async function start() {
    const app = new SimpleEditorApp();
    window.SimpleEditor = app;
    await app.initialize();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
