import { SeNARSGraph } from './zui/SeNARSGraph.js';
import { Config } from './config/Config.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { eventBus } from './core/EventBus.js';
import { EVENTS } from './config/constants.js';
import { $ } from './utils/FluentUI.js';

window.WEBSOCKET_CONFIG = window.WEBSOCKET_CONFIG || { port: 3000 };

export class ZUIApp {
    constructor() {
        this.graph = new SeNARSGraph('graph-container', document.getElementById('widget-container'));
        this.connectionManager = new ConnectionManager(new WebSocketManager());
        this.currentLayoutMode = 'fcose';
        this.traceModeActive = false;

        // Expose for debugging/testing
        window.senarsGraph = this.graph;
    }

    async initialize() {
        if (!this.graph.initialize()) {return;}

        setTimeout(() => { $('#loader').addClass('hidden'); }, 500);

        this.setupEventListeners();
        this.bindControls();
        await this._setupConnection();
    }

    setupEventListeners() {
        this.graph.on('zoomLevelChange', (data) => {
            const el = $('#zoom-level');
            if (el.dom) {
                el.text(`LEVEL: ${data.level.toUpperCase()} (${data.zoom.toFixed(2)}x)`)
                  .style({ color: data.level === 'detail' ? '#00ff9d' : '#555' });
            }
        });

        eventBus.on(EVENTS.CONCEPT_SELECT, (payload) => {
            if (payload?.concept) {
                this.showDetails(payload.concept);
            }
        });

        this.graph.on('nodeClick', (data) => {
            if (this.traceModeActive && data.node) {
                this.graph.toggleTraceMode(data.node.id());
            } else if (data.node) {
                this.graph.focusNode(data.node.id());
            }
        });

        $('#btn-close-panel').on('click', () => $('#detail-panel').removeClass('visible'));
    }

    updateLog(text, type) {
        const logContent = $('#log-content');
        if (!logContent.dom) {return;}

        const entry = document.createElement('div');
        entry.style.marginBottom = '4px';
        entry.style.color = type === 'input' ? '#00ff9d' : '#00bcd4';
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;

        logContent.dom.prepend(entry);

        if (logContent.dom.children.length > 50) {
            logContent.dom.lastElementChild.remove();
        }
    }

    showDetails(concept) {
        const panel = $('#detail-panel');
        const content = $('#detail-content');

        if (!panel.dom || !content.dom) {return;}

        const term = concept.term || concept.name || 'Unknown';
        const priority = concept.budget?.priority?.toFixed(2) || 'N/A';
        const durability = concept.budget?.durability?.toFixed(2) || 'N/A';
        const frequency = concept.truth?.frequency?.toFixed(2) || 'N/A';
        const confidence = concept.truth?.confidence?.toFixed(2) || 'N/A';

        content.clear();

        const createDetailItem = (label, val, color) => {
            const item = $('div').class('detail-item').mount(content);
            $('div').class('detail-label').text(label).mount(item);
            const valEl = $('div').class('detail-value').text(val).mount(item);
            if (color) {valEl.style({ color, fontSize: '1.1em' });}
        };

        createDetailItem('Term', term, '#00bcd4');

        const grid = $('div')
            .style({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' })
            .mount(content);

        const createGridItem = (label, val) => {
            const item = $('div').class('detail-item').mount(grid);
            $('div').class('detail-label').text(label).mount(item);
            $('div').class('detail-value').text(val).mount(item);
        };

        createGridItem('Priority', priority);
        createGridItem('Durability', durability);
        createGridItem('Frequency', frequency);
        createGridItem('Confidence', confidence);

        const rawItem = $('div').class('detail-item').mount(content);
        $('div').class('detail-label').text('Raw Data').mount(rawItem);
        $('div').class('detail-json').text(JSON.stringify(concept, null, 2)).mount(rawItem);

        panel.addClass('visible');
    }

    bindControls() {
        $('#btn-fit').on('click', () => this.graph.fitToScreen());
        $('#btn-in').on('click', () => this.graph.zoomIn());
        $('#btn-out').on('click', () => this.graph.zoomOut());
        $('#btn-layout').on('click', () => this.switchLayout('fcose'));
        $('#btn-scatter').on('click', () => this.switchLayout('scatter'));

        $('#btn-trace').on('click', (e) => {
            this.traceModeActive = !this.traceModeActive;
            const btn = $(e.currentTarget);

            if (this.traceModeActive) {btn.addClass('active');}
            else {btn.removeClass('active');}

            if (this.traceModeActive && this.graph.keyboardNav?.kbState?.selectedNode) {
                 this.graph.toggleTraceMode(this.graph.keyboardNav.kbState.selectedNode.id());
            } else if (!this.traceModeActive) {
                this.graph.traceMode = true;
                this.graph.toggleTraceMode(null);
            }
        });

        $('#btn-help').on('click', () => {
            alert(`Keyboard Shortcuts:
- Click: Select & Focus Node
- Double Click: Zoom to Node
- Shift + Click: Trace Connections
- Drag: Pan
- Scroll: Zoom
- Arrow Keys: Navigate Neighbors
- Enter: Select Focused Node
- Space: Expand Node`);
        });

        const updateScatter = () => {
            if (this.currentLayoutMode === 'scatter') {
                this.graph.applyScatterLayout($('#scatter-x').val(), $('#scatter-y').val());
            }
        };

        $('#scatter-x').on('change', updateScatter);
        $('#scatter-y').on('change', updateScatter);
    }

    switchLayout(mode) {
        this.currentLayoutMode = mode;
        const scatterControls = $('#scatter-controls');
        const btnScatter = $('#btn-scatter');
        const btnLayout = $('#btn-layout');

        if (mode === 'scatter') {
            scatterControls.style({ display: 'inline-block' });
            this.graph.applyScatterLayout(
                $('#scatter-x').val() || 'priority',
                $('#scatter-y').val() || 'confidence'
            );
            btnScatter.addClass('active');
            btnLayout.removeClass('active');
        } else {
            scatterControls.style({ display: 'none' });
            this.graph.setLayout(mode);
            btnScatter.removeClass('active');
            btnLayout.addClass('active');
        }
    }

    async _setupConnection() {
        const statusEl = $('#connection-status');

        this.connectionManager.subscribe('connection.status', (status) => {
            if (statusEl.dom) {
                statusEl.text(status)
                        .class(status === 'Connected' ? 'connected' : 'disconnected');
            }
        });

        this.connectionManager.subscribe('*', (message) => {
            this.graph.updateFromMessage(message);

            if (message.type === 'task.input' || message.type === 'task.added') {
                const task = message.payload?.task || message.payload;
                const term = task?.term?.name || task?.term?.toString() || task?.toString();
                if (term) {this.updateLog(`IN: ${term}`, 'input');}
            } else if (message.type === 'reasoning.derivation') {
                const task = message.payload?.task || message.payload;
                const term = task?.term?.name || task?.term?.toString() || task?.toString();
                if (term) {this.updateLog(`OUT: ${term}`, 'output');}
            }
        });

        try {
            await this.connectionManager.connect(Config.getWebSocketUrl());
        } catch {
            if (statusEl.dom) {
                statusEl.text('Connection Failed').class('disconnected');
            }
        }
    }
}

const app = new ZUIApp();
window.addEventListener('load', () => app.initialize());
