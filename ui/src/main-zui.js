import { SeNARSGraph } from './zui/SeNARSGraph.js';
import { Config } from './config/Config.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { eventBus } from './core/EventBus.js';
import { EVENTS } from './config/constants.js';

window.WEBSOCKET_CONFIG = window.WEBSOCKET_CONFIG || { port: 3000 };

const graph = new SeNARSGraph('graph-container', document.getElementById('widget-container'));
const connectionManager = new ConnectionManager(new WebSocketManager());

// Expose for debugging/testing
window.senarsGraph = graph;

// UI State
let currentLayoutMode = 'fcose';
let traceModeActive = false;

window.onload = async () => {
    if (graph.initialize()) {
        console.log('SeNARS ZUI Initialized');

        setTimeout(() => { document.getElementById('loader').classList.add('hidden'); }, 500);

        setupEventListeners();
        bindControls();
        // _addDemoData(graph);
        await _setupConnection();
    }
};

function setupEventListeners() {
    // Zoom listener
    graph.on('zoomLevelChange', (data) => {
        const el = document.getElementById('zoom-level');
        if (el) {
            el.textContent = `LEVEL: ${data.level.toUpperCase()} (${data.zoom.toFixed(2)}x)`;
            el.style.color = data.level === 'detail' ? '#00ff9d' : '#555';
        }
    });

    // Detail view listener
    eventBus.on(EVENTS.CONCEPT_SELECT, (payload) => {
        if (payload && payload.concept) {
            showDetails(payload.concept);
        }
    });

    // Also listen for raw node clicks from graph
    graph.on('nodeClick', (data) => {
        if (traceModeActive && data.node) {
            graph.toggleTraceMode(data.node.id());
        } else if (data.node) {
            graph.focusNode(data.node.id());
        }
    });

    // Close detail panel
    const closeBtn = document.getElementById('btn-close-panel');
    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById('detail-panel').classList.remove('visible');
        };
    }
}

function showDetails(concept) {
    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('detail-content');

    if (!panel || !content) return;

    const term = concept.term || concept.name || 'Unknown';
    const priority = concept.budget?.priority?.toFixed(2) || 'N/A';
    const durability = concept.budget?.durability?.toFixed(2) || 'N/A';
    const frequency = concept.truth?.frequency?.toFixed(2) || 'N/A';
    const confidence = concept.truth?.confidence?.toFixed(2) || 'N/A';

    content.innerHTML = `
        <div class="detail-item">
            <div class="detail-label">Term</div>
            <div class="detail-value" style="color: #00bcd4; font-size: 1.1em;">${term}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div class="detail-item">
                <div class="detail-label">Priority</div>
                <div class="detail-value">${priority}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Durability</div>
                <div class="detail-value">${durability}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Frequency</div>
                <div class="detail-value">${frequency}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Confidence</div>
                <div class="detail-value">${confidence}</div>
            </div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Raw Data</div>
            <div class="detail-json">${JSON.stringify(concept, null, 2)}</div>
        </div>
    `;

    panel.classList.add('visible');
}

function bindControls() {
    const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
    };

    bindClick('btn-fit', () => graph.fitToScreen());
    bindClick('btn-in', () => graph.zoomIn());
    bindClick('btn-out', () => graph.zoomOut());

    bindClick('btn-layout', () => switchLayout('fcose'));
    bindClick('btn-scatter', () => switchLayout('scatter'));

    const btnTrace = document.getElementById('btn-trace');
    if (btnTrace) {
        btnTrace.onclick = (e) => {
            traceModeActive = !traceModeActive;
            e.currentTarget.classList.toggle('active', traceModeActive);

            if (traceModeActive && graph.keyboardNav?.kbState?.selectedNode) {
                 const id = graph.keyboardNav.kbState.selectedNode.id();
                 graph.toggleTraceMode(id);
            } else if (!traceModeActive) {
                graph.traceMode = true;
                graph.toggleTraceMode(null);
            }
        };
    }

    bindClick('btn-help', () => {
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
        if (currentLayoutMode === 'scatter') {
            const x = document.getElementById('scatter-x').value;
            const y = document.getElementById('scatter-y').value;
            graph.applyScatterLayout(x, y);
        }
    };

    const xSelect = document.getElementById('scatter-x');
    const ySelect = document.getElementById('scatter-y');
    if (xSelect) xSelect.onchange = updateScatter;
    if (ySelect) ySelect.onchange = updateScatter;
}

function switchLayout(mode) {
    currentLayoutMode = mode;
    const scatterControls = document.getElementById('scatter-controls');
    const btnScatter = document.getElementById('btn-scatter');
    const btnLayout = document.getElementById('btn-layout');

    if (mode === 'scatter') {
        if (scatterControls) scatterControls.style.display = 'inline-block';
        const x = document.getElementById('scatter-x')?.value || 'priority';
        const y = document.getElementById('scatter-y')?.value || 'confidence';
        graph.applyScatterLayout(x, y);
        if (btnScatter) btnScatter.classList.add('active');
        if (btnLayout) btnLayout.classList.remove('active');
    } else {
        if (scatterControls) scatterControls.style.display = 'none';
        graph.setLayout(mode);
        if (btnScatter) btnScatter.classList.remove('active');
        if (btnLayout) btnLayout.classList.add('active');
    }
}

async function _setupConnection() {
    const statusEl = document.getElementById('connection-status');

    connectionManager.subscribe('connection.status', (status) => {
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = status === 'Connected' ? 'connected' : 'disconnected';
        }
    });

    connectionManager.subscribe('*', (message) => {
        graph.updateFromMessage(message);
    });

    try {
        const url = Config.getWebSocketUrl();
        await connectionManager.connect(url);
    } catch (e) {
        console.error('Failed to connect:', e);
        if (statusEl) {
            statusEl.textContent = 'Connection Failed';
            statusEl.className = 'disconnected';
        }
    }
}

function _addDemoData(graph) {
    const concepts = [
        { term: 'self', priority: 1.0, frequency: 1.0 },
        { term: 'world', priority: 0.9, frequency: 0.9 },
        { term: 'knowledge', priority: 0.8, frequency: 0.8 },
        { term: 'reasoning', priority: 0.85, frequency: 0.7 },
        { term: 'perception', priority: 0.7, frequency: 0.6 },
        { term: 'action', priority: 0.75, frequency: 0.65 }
    ];

    concepts.forEach(c => graph.addNode({
        term: c.term,
        budget: { priority: c.priority, durability: 0.8, quality: 0.7 },
        truth: { frequency: c.frequency, confidence: 0.9 }
    }, false));

    graph.addEdge({ source: 'self', target: 'world', type: 'interaction' }, false);
    graph.addEdge({ source: 'self', target: 'knowledge', type: 'possession' }, false);
    graph.addEdge({ source: 'knowledge', target: 'reasoning', type: 'usage' }, false);

    graph.scheduleLayout();
}
