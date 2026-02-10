import { UIConfig } from '../config/UIConfig.js';
import { ConsolePanel } from '../components/ConsolePanel.js';
import { REPLPanel } from '../components/REPLPanel.js';
import { DerivationTree } from '../components/DerivationTree.js';
import { MemoryInspector } from '../components/MemoryInspector.js';
import { SettingsPanel } from '../components/SettingsPanel.js';
import { ExampleBrowser } from '../components/ExampleBrowser.js';

export class LayoutFactory {
    static registerComponents(app, layout) {
        // Register Core Components
        layout.registerComponentFactoryFunction('graphComponent', (c) => LayoutFactory.createGraphComponent(app, c));
        layout.registerComponentFactoryFunction('metricsComponent', (c) => LayoutFactory.createMetricsComponent(app, c));

        // Consolidated Console
        layout.registerComponentFactoryFunction('consoleComponent', (container) => {
            const el = document.createElement('div');
            el.className = 'panel-container';
            container.element.appendChild(el);
            const comp = new ConsolePanel(el);
            comp.initialize(app);
        });

        // REPL Notebook
        layout.registerComponentFactoryFunction('replComponent', (container) => {
            const el = document.createElement('div');
            el.className = 'panel-container';
            container.element.appendChild(el);
            const comp = new REPLPanel(el);
            comp.initialize(app);
        });

        // Register New / Auxiliary Components
        layout.registerComponentFactoryFunction('derivationComponent', (container) => {
            const el = document.createElement('div');
            el.className = 'panel-container';
            container.element.appendChild(el);
            const comp = new DerivationTree(el);
            comp.initialize();
            app.registerComponent('derivationTree', comp);
        });

        layout.registerComponentFactoryFunction('memoryComponent', (container) => {
            const el = document.createElement('div');
            el.className = 'panel-container';
            container.element.appendChild(el);
            const comp = new MemoryInspector(el);
            comp.initialize();
            app.registerComponent('memoryInspector', comp);
        });

        layout.registerComponentFactoryFunction('settingsComponent', (container) => {
            const el = document.createElement('div');
            el.className = 'panel-container';
            container.element.appendChild(el);
            const comp = new SettingsPanel(el);
            comp.initialize();
        });

        layout.registerComponentFactoryFunction('examplesComponent', (container) => {
            const el = document.createElement('div');
            // Ensure unique IDs if multiple instances (though unlikely with ID-based ExampleBrowser)
            // ExampleBrowser currently expects a containerID string, which is a bit limiting for dynamic layout.
            // We'll give it a generated ID or just pass the element if refactored.
            // For now, we reuse the pattern from main-online.js
            const containerId = 'example-browser-container-' + Math.random().toString(36).substr(2, 9);
            el.id = containerId;
            el.className = 'example-browser-container panel-container';
            el.style.padding = '10px';
            container.element.appendChild(el);

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
    }

    static createGraphComponent(app, container) {
        const el = document.createElement('div');
        el.id = UIConfig.ELEMENT_IDS.graphContainer;
        el.className = 'cytoscape-container';
        // Use CSS vars
        Object.assign(el.style, { width: '100%', height: '100%', background: 'var(--bg-dark)' });

        const controls = document.createElement('div');
        controls.className = 'graph-overlay-controls';

        controls.innerHTML = `
            <button id="${UIConfig.ELEMENT_IDS.btnZoomIn}" title="Zoom In"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg></button>
            <button id="${UIConfig.ELEMENT_IDS.btnZoomOut}" title="Zoom Out"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg></button>
            <button id="${UIConfig.ELEMENT_IDS.btnFit}" title="Fit to Screen"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6z"/></svg></button>
            <button id="${UIConfig.ELEMENT_IDS.refreshGraph}" title="Refresh Graph"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
            <div style="height:1px; background:var(--border-color); margin:2px 0;"></div>
            <button id="btn-layout-fcose" title="Force Directed" style="font-size:10px">F</button>
            <button id="btn-layout-grid" title="Grid Layout" style="font-size:10px">G</button>
            <button id="btn-layout-circle" title="Circle Layout" style="font-size:10px">C</button>
            <div style="height:1px; background:var(--border-color); margin:2px 0;"></div>
            <div style="font-size:10px; color:#aaa; margin-bottom:2px;">FILTER</div>
            <label title="Show Tasks" style="display:flex; align-items:center; font-size:10px; gap:4px; color:#aaa;">
                <input type="checkbox" id="filter-show-tasks" checked> Tasks
            </label>
            <label title="Show Concepts" style="display:flex; align-items:center; font-size:10px; gap:4px; color:#aaa;">
                <input type="checkbox" id="filter-show-concepts" checked> Concepts
            </label>
        `;

        container.element.append(el, controls);

        controls.addEventListener('change', (e) => {
            if (e.target.id.startsWith('filter-')) {
                const showTasks = controls.querySelector('#filter-show-tasks').checked;
                const showConcepts = controls.querySelector('#filter-show-concepts').checked;

                // Dispatch event for GraphManager
                document.dispatchEvent(new CustomEvent('senars:graph:filter', {
                    detail: { showTasks, showConcepts }
                }));
            }
        });

        // Register basic graph controls
        const ids = ['btnZoomIn', 'btnZoomOut', 'btnFit', 'refreshGraph'];
        app.uiElements.register('graphContainer', el);
        ids.forEach(id => {
            const btn = controls.querySelector(`#${UIConfig.ELEMENT_IDS[id]}`);
            if(btn) app.uiElements.register(id, btn);
        });
    }

    static createMetricsComponent(app, container) {
        const el = document.createElement('div');
        el.className = 'panel-container';

        el.innerHTML = `
            <div class="status-bar" style="padding: 10px; border-bottom: 1px solid var(--border-color);">
                <div class="status-item" style="margin-bottom: 5px;">
                    <div class="status-indicator status-disconnected" id="${UIConfig.ELEMENT_IDS.statusIndicator}" style="display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:5px;"></div>
                    <span id="${UIConfig.ELEMENT_IDS.connectionStatus}" style="font-size:11px; color:var(--text-muted);">OFFLINE</span>
                </div>
                <div class="status-item">
                     <span class="cycle-badge" id="${UIConfig.ELEMENT_IDS.cycleCount}" style="color:var(--accent-primary); font-family:var(--font-mono);">Cycle: 0</span>
                     <span class="divider" style="color:var(--border-color); margin:0 5px;">|</span>
                     <span id="${UIConfig.ELEMENT_IDS.messageCount}" style="color:var(--text-main);">0</span> msgs
                </div>
            </div>
            <div id="${UIConfig.ELEMENT_IDS.metricsPanel}" class="metrics-container"></div>
        `;

        container.element.appendChild(el);

        const ids = ['metricsPanel', 'connectionStatus', 'statusIndicator', 'cycleCount', 'messageCount'];
        ids.forEach(id => app.uiElements.register(id, el.querySelector(`#${UIConfig.ELEMENT_IDS[id]}`)));
    }
}
