import { ConfigPanel } from '../components/ConfigPanel.js';
import { Console } from '../components/Console.js';
import { DemoControls } from '../components/DemoControls.js';
import { GraphPanel } from '../components/GraphPanel.js';
import { Sidebar } from '../components/Sidebar.js';
import { WebSocketManager } from '../connection/WebSocketManager.js';
import { DemoClient } from './DemoClient.js';

/**
 * DemoRunnerApp - Main application logic for the demo runner UI.
 */
export class DemoRunnerApp {
    static VIEW_TITLES = {
        source: 'Source Code',
        graph: 'Graph View',
        metrics: 'Demo Metrics'
    };

    constructor() {
        this.wsManager = new WebSocketManager();
        this.client = new DemoClient(this.wsManager);

        this.sidebar = new Sidebar('sidebar');
        this.console = new Console('console-container', 'command-input');
        this.configPanel = new ConfigPanel('config-overlay');
        this.graphPanel = new GraphPanel('graph-container');
        this.controls = new DemoControls();
        this.controls.setClient(this.client);

        this.currentDemoId = null;
        this.connectionStatus = document.getElementById('connection-status');

        // Sidebar State
        this.rightSidebar = document.getElementById('right-sidebar');
        this.sourceView = document.getElementById('source-view');
        this.graphView = document.getElementById('graph-view');
        this.metricsView = document.getElementById('metrics-view');
        this.sidebarTitle = document.getElementById('right-sidebar-title');
    }

    initialize() {
        this.setupWebSocket();
        this._setupSidebarControls();
        this._setupConsoleControls();

        const btnConfig = document.getElementById('btn-config');
        btnConfig?.addEventListener('click', () => this.configPanel.show());

        // Setup console input handler
        this.console.onInput((input) => {
            // Send as Narsese input
            this.wsManager.sendMessage('narseseInput', { text: input });
        });

        this.sidebar.onSelect(this._handleDemoSelect.bind(this));

        // Connect
        this.wsManager.connect();

        // Init graph
        this.graphPanel.initialize();
    }

    _setupConsoleControls() {
        btnClear?.addEventListener('click', () => this.console.clear());
    }

    _handleDemoSelect(demoId, demo) {
        const title = document.getElementById('demo-title');
        const desc = document.getElementById('demo-description');
        if (title) title.textContent = demo.name;
        if (desc) desc.textContent = demo.description;
        this.runDemo(demoId);
    }

    _setupSidebarControls() {
        const btnToggleSource = document.getElementById('btn-toggle-source');
        const btnToggleGraph = document.getElementById('btn-toggle-graph');
        const btnToggleMetrics = document.getElementById('btn-toggle-metrics');
        const btnCloseRightSidebar = document.getElementById('btn-close-right-sidebar');

        btnToggleSource?.addEventListener('click', () => this._openRightSidebar('source'));
        btnToggleGraph?.addEventListener('click', () => this._openRightSidebar('graph'));
        btnToggleMetrics?.addEventListener('click', () => this._openRightSidebar('metrics'));
        btnCloseRightSidebar?.addEventListener('click', () => this._closeRightSidebar());
    }

    _openRightSidebar(view) {
        if (!this.rightSidebar) return;

        this.rightSidebar.classList.remove('hidden');

        // Enable/Disable graph updates
        if (this.graphPanel?.graphManager) {
            this.graphPanel.graphManager.setUpdatesEnabled(view === 'graph');
        }

        // Toggle views
        this.sourceView.classList.toggle('hidden', view !== 'source');
        this.graphView.classList.toggle('hidden', view !== 'graph');
        if (this.metricsView) this.metricsView.classList.toggle('hidden', view !== 'metrics');

        if (this.sidebarTitle) {
            this.sidebarTitle.textContent = DemoRunnerApp.VIEW_TITLES[view] || 'View';
        }

        if (view === 'graph') {
            // Resize graph after visibility change
            setTimeout(() => {
                this.graphPanel.graphManager?.cy?.resize();
                this.graphPanel.graphManager?.cy?.fit();
            }, 100);
        }
    }

    _closeRightSidebar() {
        if (this.rightSidebar) {
            this.rightSidebar.classList.add('hidden');
            this.graphPanel?.graphManager?.setUpdatesEnabled(false);
        }
    }

    setupWebSocket() {
        this.wsManager.subscribe('connection.status', this._handleConnectionStatus.bind(this));
        this.wsManager.subscribe('demoList', this._handleDemoList.bind(this));
        this.wsManager.subscribe('demoStep', this._handleDemoStep.bind(this));
        this.wsManager.subscribe('demoState', this._handleDemoState.bind(this));
        this.wsManager.subscribe('demoSource', this._handleDemoSource.bind(this));
        this.wsManager.subscribe('*', this._handleGeneralMessage.bind(this));
    }

    _handleConnectionStatus(status) {
        if (this.connectionStatus) {
            this.connectionStatus.textContent = status;
            this.connectionStatus.className = `status-badge status-${status}`;
        }
        if (status === 'connected') {
            this.client.listDemos();
        }
    }

    _handleDemoList(message) {
        const demos = message.payload;
        this.sidebar.setDemos(demos);

        const urlParams = new URLSearchParams(window.location.search);
        const demoId = urlParams.get('demo');
        if (demoId && !this.currentDemoId) {
            this.runDemo(demoId);
        }
    }

    _handleDemoStep(message) {
        const payload = message.payload;
        this.console.log(`[Step ${payload.step}] ${payload.description}`, 'info');
        if (payload.data?.input) {
            this.console.log(`> ${payload.data.input}`, 'input');
        }
    }

    _handleDemoState(message) {
        const payload = message.payload;
        this.controls.updateState(payload.state);

        const stateMessages = {
            running: ['--- Demo Started ---', 'success'],
            completed: ['--- Demo Completed ---', 'success'],
            error: [`Error: ${payload.error}`, 'error'],
            paused: ['--- Demo Paused ---', 'warning'],
            stopped: ['--- Demo Stopped ---', 'warning']
        };

        if (stateMessages[payload.state]) {
            this.console.log(...stateMessages[payload.state]);
        }
    }

    _handleDemoSource(message) {
        if (message.payload.demoId === this.currentDemoId) {
            const editor = document.getElementById('source-editor');
            if (editor) editor.value = message.payload.source;
        }
    }

    _handleGeneralMessage(msg) {
        if (msg.type === 'demoMetrics') {
            this._updateMetrics(msg.payload);
            return;
        }

        this.graphPanel.update(msg);

        const handlers = {
            'narsese.output': (m) => this.console.log(m.payload, 'reasoning'),
            'reasoning.derivation': (m) => this.console.log(m.payload || 'Processing...', 'reasoning'),
            'reasoning.step': (m) => this.console.log(m.payload || 'Processing...', 'reasoning'),
            'task.added': (m) => this.console.log(m.payload || 'Task processed', 'task')
        };

        const handler = handlers[msg.type];
        if (handler) {
            handler(msg);
            return;
        }

        // Fallback checks for partial matches
        if (msg.type.includes('task')) {
             this.console.log(msg.payload || 'Task processed', 'task');
        } else if (msg.type.includes('question') || msg.type.includes('answer')) {
             this.console.log(msg.payload || 'Question processed', 'question');
        } else if (msg.type.includes('concept')) {
             this.console.log(msg.payload || 'Concept processed', 'concept');
        }
    }

    _updateMetrics(payload) {
        const content = document.getElementById('metrics-content');
        if (content) {
            content.textContent = JSON.stringify(payload, null, 2);
        }
    }

    runDemo(demoId) {
        if (this.currentDemoId && this.currentDemoId !== demoId) {
            this.console.log(`Stopping previous demo: ${this.currentDemoId}`, 'info');
            this.client.stopDemo(this.currentDemoId);
        }

        this.graphPanel.reset();
        this.currentDemoId = demoId;
        this.controls.setDemoId(demoId);

        const config = this.configPanel.getConfig();

        this.console.clear();
        this.console.log(`Starting demo: ${demoId}...`, 'info');

        this.client.startDemo(demoId, config);
        this.client.getDemoSource(demoId);

        const url = new URL(window.location);
        url.searchParams.set('demo', demoId);
        window.history.pushState({}, '', url);
    }
}
