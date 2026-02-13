import { GoldenLayout } from 'golden-layout';
import { SeNARSUI } from './SeNARSUI.js';
import { LocalConnectionManager } from './connection/LocalConnectionManager.js';
import { ConnectionManager } from './connection/ConnectionManager.js';
import { UIConfig } from './config/UIConfig.js';
import { ExampleBrowser } from './components/ExampleBrowser.js';

// Setup Layout Configuration
const LAYOUT_CONFIG = {
    root: {
        type: 'row',
        content: [{
            title: 'Graph Visualization', type: 'component', componentType: 'graphComponent', width: 60
        }, {
            type: 'column',
            content: [{
                title: 'Activity Log', type: 'component', componentType: 'logComponent', height: 40
            }, {
                type: 'stack',
                height: 60,
                content: [
                     { title: 'Examples', type: 'component', componentType: 'examplesComponent' },
                     { title: 'REPL / Control', type: 'component', componentType: 'replComponent' },
                     { title: 'System Metrics', type: 'component', componentType: 'metricsComponent' }
                ]
            }]
        }]
    }
};

function createGraphComponent(app, container) {
    const el = document.createElement('div');
    el.id = UIConfig.ELEMENT_IDS.graphContainer;
    el.className = 'cytoscape-container';
    Object.assign(el.style, { width: '100%', height: '100%', background: '#252525' });

    const controls = document.createElement('div');
    controls.className = 'graph-controls';
    Object.assign(controls.style, {
        position: 'absolute', top: '10px', left: '10px', zIndex: '10',
        background: 'rgba(42, 42, 42, 0.8)', borderRadius: '4px'
    });

    controls.innerHTML = `
        <button id="${UIConfig.ELEMENT_IDS.btnZoomIn}" title="Zoom In">➕</button>
        <button id="${UIConfig.ELEMENT_IDS.btnZoomOut}" title="Zoom Out">➖</button>
        <button id="${UIConfig.ELEMENT_IDS.btnFit}" title="Fit to Screen">⬜</button>
        <button id="${UIConfig.ELEMENT_IDS.refreshGraph}" title="Refresh Graph">🔄</button>
        <label class="checkbox-control"><input type="checkbox" id="${UIConfig.ELEMENT_IDS.showTasksToggle}" checked> Tasks</label>
    `;

    container.element.append(el, controls);

    const ids = ['btnZoomIn', 'btnZoomOut', 'btnFit', 'refreshGraph', 'showTasksToggle'];
    app.uiElements.register('graphContainer', el);
    ids.forEach(id => app.uiElements.register(id, controls.querySelector(`#${UIConfig.ELEMENT_IDS[id]}`)));
}

function createLogComponent(app, container) {
    const el = document.createElement('div');
    el.className = 'view-layer active';
    el.id = UIConfig.ELEMENT_IDS.logView;
    Object.assign(el.style, { display: 'flex', flexDirection: 'column', height: '100%' });

    el.innerHTML = `<div class="logs-container" id="${UIConfig.ELEMENT_IDS.logsContainer}"></div>`;
    container.element.appendChild(el);
    app.uiElements.register('logsContainer', el.querySelector(`#${UIConfig.ELEMENT_IDS.logsContainer}`));
}

function createReplComponent(app, container) {
    const el = document.createElement('div');
    el.className = 'log-panel';
    Object.assign(el.style, { display: 'flex', flexDirection: 'column', height: '100%' });

    el.innerHTML = `
        <div class="panel-header" style="justify-content: flex-end;">
             <div class="control-toolbar">
                <button class="icon-btn" id="${UIConfig.ELEMENT_IDS.btnPlayPause}" title="Play/Pause">▶</button>
                <button class="icon-btn" id="${UIConfig.ELEMENT_IDS.btnStep}" title="Single Step">⏯</button>
                <button class="icon-btn" id="${UIConfig.ELEMENT_IDS.btnReset}" title="Reset System">🔄</button>
             </div>
        </div>
        <div style="flex: 1;"></div>
        <div class="input-section">
            <div class="input-mode-toggle">
                <label class="mode-option"><input type="radio" name="input-mode" value="narsese" id="${UIConfig.ELEMENT_IDS.inputModeNarsese}" checked> Narsese</label>
                <label class="mode-option"><input type="radio" name="input-mode" value="agent" id="${UIConfig.ELEMENT_IDS.inputModeAgent}"> Agent</label>
            </div>
            <div class="input-group">
                <input type="text" id="${UIConfig.ELEMENT_IDS.commandInput}" placeholder="Enter Narsese command..." autocomplete="off">
                <button id="${UIConfig.ELEMENT_IDS.sendButton}">Send</button>
            </div>
            <div class="input-group">
                <button id="${UIConfig.ELEMENT_IDS.btnToggleContrast}" style="font-size: 0.8em; padding: 5px 10px;">High Contrast</button>
            </div>
        </div>`;

    container.element.appendChild(el);

    const ids = ['commandInput', 'sendButton', 'btnPlayPause', 'btnStep', 'btnReset', 'inputModeNarsese', 'inputModeAgent'];
    ids.forEach(id => app.uiElements.register(id, el.querySelector(`#${UIConfig.ELEMENT_IDS[id]}`)));
}

function createMetricsComponent(app, container) {
    const el = document.createElement('div');
    Object.assign(el.style, { padding: '10px', background: '#252526' });

    el.innerHTML = `
        <div class="status-bar" style="border: none; padding: 0; margin-bottom: 10px;">
            <div class="status-item">
                <div class="status-indicator status-disconnected" id="${UIConfig.ELEMENT_IDS.statusIndicator}"></div>
                <span id="${UIConfig.ELEMENT_IDS.connectionStatus}">Offline Mode</span>
            </div>
            <div class="status-item">
                 <span class="cycle-badge" id="${UIConfig.ELEMENT_IDS.cycleCount}">Cycle: 0</span>
                 <span class="divider">|</span>
                 <span id="${UIConfig.ELEMENT_IDS.messageCount}">0</span> msgs
            </div>
        </div>
        <div id="${UIConfig.ELEMENT_IDS.metricsPanel}" class="metrics-container"></div>
        <div id="${UIConfig.ELEMENT_IDS.tracePanel}" class="trace-container hidden"></div>
    `;

    container.element.appendChild(el);

    const ids = ['metricsPanel', 'tracePanel', 'connectionStatus', 'statusIndicator', 'cycleCount', 'messageCount'];
    ids.forEach(id => app.uiElements.register(id, el.querySelector(`#${UIConfig.ELEMENT_IDS[id]}`)));
}

async function start() {
    const layout = new GoldenLayout(document.getElementById('layout-root'));
    const connection = new ConnectionManager(new LocalConnectionManager());
    const app = new SeNARSUI(connection);

    layout.registerComponentFactoryFunction('graphComponent', (c) => createGraphComponent(app, c));
    layout.registerComponentFactoryFunction('logComponent', (c) => createLogComponent(app, c));
    layout.registerComponentFactoryFunction('replComponent', (c) => createReplComponent(app, c));
    layout.registerComponentFactoryFunction('metricsComponent', (c) => createMetricsComponent(app, c));

    layout.registerComponentFactoryFunction('examplesComponent', (container) => {
        const el = document.createElement('div');
        // Use a unique ID to avoid collision with static index.html
        const containerId = 'example-browser-container-gl';
        el.id = containerId;
        el.className = 'example-browser-container';
        el.style.padding = '10px';
        el.style.overflow = 'auto';
        el.style.height = '100%';
        container.element.appendChild(el);

        // Manual Init for this component
        new ExampleBrowser(containerId, {
            onSelect: (node) => {
                 if (node.type === 'file') {
                    app.demoManager.runStaticDemo({
                        id: node.id,
                        name: node.name,
                        path: node.path
                    });
                }
            }
        }).initialize();
    });

    layout.loadLayout(LAYOUT_CONFIG);

    // Allow GoldenLayout to render first
    setTimeout(() => {
        app.initialize();
        // Force update status for offline mode
        app._updateStatus('connected'); // In local mode, we are "connected" to the in-memory core
        console.log('SeNARS Offline IDE Started');
    }, 100);

    window.addEventListener('resize', () => layout.updateRootSize());
}

window.addEventListener('DOMContentLoaded', start);
