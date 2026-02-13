import { UIElements } from './ui/UIElements.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { GraphManager } from './visualization/GraphManager.js';
import { DemoManager } from './demo/DemoManager.js';
import { Logger } from './logging/Logger.js';
import { CommandProcessor } from './command/CommandProcessor.js';
import { UIEventHandlers } from './ui/UIEventHandlers.js';
import { ActivityLogPanel } from './components/ActivityLogPanel.js';
import { SystemMetricsPanel } from './components/SystemMetricsPanel.js';
import { ControlPanel } from './ui/ControlPanel.js';
import { LMActivityIndicator } from './components/LMActivityIndicator.js';
import { ExampleBrowser } from './components/ExampleBrowser.js';

export class SeNARSUI {
    static CYCLE_EXTRACTORS = {
        'nar.cycle.step': (p) => p?.cycle,
        'narInstance': (p) => p?.cycleCount
    };

    constructor(connectionAdapter = null) {
        this.uiElements = new UIElements();
        this.logger = new Logger();
        this.connectionManager = connectionAdapter || new ConnectionManager(new WebSocketManager());
        this.commandProcessor = new CommandProcessor(this.connectionManager, this.logger);

        this.graphManager = new GraphManager(this.uiElements.getAll(), {
            onNodeSelect: (id) => this.commandProcessor.processCommand(`/inspect ${id}`),
            onNodeContext: (id) => console.log('Context menu:', id)
        });
        this.commandProcessor.graphManager = this.graphManager;

        this.controlPanel = new ControlPanel(this.uiElements, this.commandProcessor, this.logger);
        this.demoManager = new DemoManager(this.uiElements, this.commandProcessor, this.logger);

        // Defer initialization of panels that require DOM elements until initialize() is called
        this.metricsPanel = null;
        this.activityLogPanel = null;
        this.lmActivityIndicator = null;
        this.exampleBrowser = null;

        this.uiEventHandlers = null;

        // Only call initialize if no connection adapter is provided (for backward compatibility)
        if (!connectionAdapter) {
            this.initialize();
        }
    }

    initialize() {
        this.logger.setUIElements(this.uiElements.getAll());
        this.graphManager.initialize(this.uiElements.get('graphContainer'));
        this.controlPanel.initialize();

        // Use correct IDs from Config (or hardcoded to match HTML/UIConfig)
        // ui/src/config/UIConfig.js defines: tracePanel: 'trace-panel', metricsPanel: 'metrics-panel'
        new ActivityLogPanel('trace-panel');
        this.metricsPanel = new SystemMetricsPanel('metrics-panel');
        this.lmActivityIndicator = new LMActivityIndicator(this.uiElements.get('graphContainer'));
        this.exampleBrowser = new ExampleBrowser('example-browser-container', {
            onSelect: (node) => {
                // If it's a file, run it
                if (node.type === 'file') {
                    // Try to map to STATIC_DEMOS if exists, or use generic runner
                    this.demoManager.runStaticDemo({
                        id: node.id,
                        name: node.name,
                        path: node.path
                    });
                }
            }
        });
        this.exampleBrowser.initialize();

        this.eventHandlers = new UIEventHandlers(
            this.uiElements,
            this.commandProcessor,
            this.demoManager,
            this.graphManager,
            this.connectionManager,
            this.controlPanel
        );
        this.eventHandlers.setupEventListeners();

        // High Contrast Mode Toggle
        const contrastBtn = document.getElementById('btn-toggle-contrast');
        if (contrastBtn) {
            contrastBtn.addEventListener('click', () => {
                document.body.classList.toggle('high-contrast');
                this.graphManager.updateStyle();
            });
        }

        // Initialize demos (loads static demos immediately)
        this.demoManager.initialize();

        this._setupConnectionHandlers();
        this._setupWebSocketHandlers();

        console.log('SeNARS UI Initialized');
        // Welcome message handled by connection manager
    }

    _setupConnectionHandlers() {
        document.addEventListener('senars:action', ({ detail: { type, payload, context } }) => {
            this.connectionManager.sendMessage('activity.action', { type, payload, context, id: Date.now() });
            this.logger.addLogEntry(`Action dispatched: ${type}`, 'info', '⚡');
        });

        this.connectionManager.connect();
        this.connectionManager.subscribe('connection.status', (status) => status === 'connected' && this.demoManager.requestDemoList());
    }

    _setupWebSocketHandlers() {
        this.connectionManager.subscribe('*', (msg) => this._handleMessage(msg));
        this.connectionManager.subscribe('connection.status', (status) => this._updateStatus(status));

        const handlers = {
            'reasoning:derivation': (msg) => {
                this._handleTrace(msg);
                this.graphManager.handleDerivation(msg);
            },
            'reasoning:concept': (msg) => this.graphManager.updateGraph(msg),
            'metrics:update': (msg) => this.metricsPanel.update(msg.payload),
            'agent/result': (msg) => this.logger.addLogEntry(msg.payload?.result || JSON.stringify(msg), 'result', '💡'),
            'agent/thought': (msg) => this.logger.addLogEntry(msg.payload?.thought || JSON.stringify(msg), 'thought', '💭'),
            'error': (msg) => this.logger.addLogEntry(msg.payload?.message || "Unknown error", 'error', '🚨'),
            'memory:focus:promote': (msg) => {
                const nodeId = msg.payload?.nodeId ?? msg.payload?.conceptId;
                nodeId && this.graphManager.animateGlow(nodeId, 1.0);
            },
            'memory:focus:demote': (msg) => {
                const nodeId = msg.payload?.nodeId ?? msg.payload?.conceptId;
                nodeId && this.graphManager.animateGlow(nodeId, 0.3);
            },
            'concept.created': (msg) => {
                const nodeId = msg.payload?.id;
                nodeId && setTimeout(() => this.graphManager.animateFadeIn(nodeId), 50);
            },
            'lm:prompt:start': () => this.lmActivityIndicator && this.lmActivityIndicator.show(),
            'lm:prompt:complete': () => this.lmActivityIndicator && this.lmActivityIndicator.hide(),
            'lm:error': (msg) => this.lmActivityIndicator && this.lmActivityIndicator.showError(msg.payload?.error ?? 'LM Error')
        };

        Object.entries(handlers).forEach(([type, handler]) => this.connectionManager.subscribe(type, handler));
    }

    _handleMessage(message) {
        if (!message) return;

        try {
            this._updateMessageCount();
            this._updateSystemState(message);

            if (this._handleSpecializedMessages(message)) return;

            const handlers = {
                'metrics.updated': (payload) => this.metricsPanel?.update(payload),
                'metrics.anomaly': () => {}, // No-op
                'activity.new': (payload) => this.activityLogPanel?.addActivity(payload)
            };

            const handler = handlers[message.type];
            if (handler) {
                handler(message.payload);
            } else {
                this.graphManager.updateFromMessage(message);
            }

        } catch (error) {
            this.logger.log(`Error handling message of type ${message?.type ?? 'unknown'}: ${error.message}`, 'error', '❌');
            process?.env?.NODE_ENV !== 'production' && console.error('Full error details:', error, message);
        }
    }

    _handleSpecializedMessages(message) {
        const handlers = {
            'demoList': (p) => this.demoManager.handleDemoList(p),
            'demoStep': (p) => this.demoManager.handleDemoStep(p),
            'demoState': (p) => this.demoManager.handleDemoState(p),
            'demoMetrics': (p) => {
                p?.metrics?.cyclesCompleted !== undefined && this.controlPanel.updateCycleCount(p.metrics.cyclesCompleted);
                return true;
            },
            'agent/result': (p) => {
                this.logger.addLogEntry(
                    typeof p.result === 'string' ? p.result : JSON.stringify(p.result),
                    'info',
                    '🤖'
                );
            }
        };

        const handler = handlers[message.type];
        return handler ? handler(message.payload) || message.type === 'demoMetrics' : false;
    }

    _updateSystemState(message) {
        const extractor = SeNARSUI.CYCLE_EXTRACTORS[message.type];
        const cycleValue = extractor?.(message.payload);
        cycleValue !== undefined && this.controlPanel.updateCycleCount(cycleValue);
    }

    _updateMessageCount() {
        const el = this.uiElements.get('messageCount');
        el && (el.textContent = (parseInt(el.textContent) || 0) + 1);
    }

    _handleNodeAction(action, data) {
        this.logger.log(`Graph Action: ${action} on ${data.term}`, 'info', '🖱️');
    }

    _updateStatus(status) {
        const el = document.getElementById('connection-status');
        const indicator = document.getElementById('status-indicator');

        // Update connection text
        if (el) el.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        // Update indicator class
        if (indicator) indicator.className = `status-indicator status-${status}`;

        // Visual feedback for disconnected state (gray out)
        if (status === 'disconnected' || status === 'error') {
            document.body.classList.add('disconnected');
        } else {
            document.body.classList.remove('disconnected');
        }
    }

    _handleTrace(msg) {
        // Trace handled by ActivityLogPanel subscription or unified logging
    }
}
