import { GoldenLayout } from 'golden-layout';
import { GraphPanel } from '../components/GraphPanel.js';
import { MemoryInspector } from '../components/MemoryInspector.js';
import { DerivationTree } from '../components/DerivationTree.js';
import { SystemMetricsPanel } from '../components/SystemMetricsPanel.js';
import { NotebookPanel } from '../components/NotebookPanel.js';
import { ExampleBrowser } from '../components/ExampleBrowser.js';
import { LMActivityIndicator } from '../components/LMActivityIndicator.js';
import { LayoutPresets } from '../config/LayoutPresets.js';
import { COMPONENTS, STORAGE_KEYS } from '../config/constants.js';

export class LayoutManager {
    constructor(app, containerId) {
        this.app = app;
        this.containerId = containerId;
        this.layout = null;
    }

    initialize(presetName) {
        const layoutRoot = document.getElementById(this.containerId);
        if (!layoutRoot) {
            console.error('Layout root not found');
            return;
        }

        this.layout = new GoldenLayout(layoutRoot);
        this._registerComponents();
        this._loadLayout(presetName);
        this._setupStateSaving(presetName);

        window.addEventListener('resize', () => this.layout.updateRootSize());
    }

    _registerComponents() {
        const componentMap = {
            [COMPONENTS.NOTEBOOK]: (c) => this._createNotebook(c),
            'replComponent': (c) => this._createNotebook(c), // Legacy
            [COMPONENTS.GRAPH]: (c) => this._createGraph(c),
            [COMPONENTS.MEMORY]: (c) => this._createStandard(c, MemoryInspector, 'memory'),
            [COMPONENTS.DERIVATION]: (c) => this._createStandard(c, DerivationTree, 'derivation', true),
            [COMPONENTS.METRICS]: (c) => this._createStandard(c, SystemMetricsPanel, 'metrics', false, 'render'),
            [COMPONENTS.SETTINGS]: (c) => this._createSettings(c),
            [COMPONENTS.EXAMPLES]: (c) => this._createExamples(c)
        };

        Object.entries(componentMap).forEach(([name, factory]) => {
            this.layout.registerComponentFactoryFunction(name, factory);
        });
    }

    _loadLayout(presetName) {
        let config = LayoutPresets[presetName] || LayoutPresets.ide;
        this.layout.loadLayout(config);
    }

    _setupStateSaving(presetName) {
        this.layout.on('stateChanged', () => {
            if (this.layout.isInitialised) {
                localStorage.setItem(`${STORAGE_KEYS.LAYOUT_PREFIX}${presetName}`, JSON.stringify(this.layout.toConfig()));
            }
        });
    }

    _createNotebook(container) {
        const panel = new NotebookPanel(container.element);
        panel.initialize(this.app);
        this.app.registerComponent('notebook', panel);
        this.app.updateStats();
    }

    _createGraph(container) {
        const panel = new GraphPanel(container.element);
        panel.initialize();
        this.app.registerComponent('graph', panel);

        if (this.app.commandProcessor) {
             this.app.commandProcessor.graphManager = panel.graphManager;
             panel.graphManager.setCommandProcessor(this.app.commandProcessor);
        }

        if (panel.container) {
            this.app.lmActivityIndicator = new LMActivityIndicator(panel.container);
        }

        container.on('resize', () => panel.resize());
    }

    _createStandard(container, Class, name, resize = false, initMethod = 'initialize') {
        const panel = new Class(container.element);
        panel[initMethod]();
        this.app.registerComponent(name, panel);
        if (resize && panel.resize) {
             container.on('resize', () => panel.resize());
        }
    }

    _createSettings(container) {
        import('../components/SettingsPanel.js').then(({ SettingsPanel }) => {
            const panel = new SettingsPanel(container.element);
            panel.app = this.app;
            panel.initialize();
            this.app.registerComponent('settings', panel);
        });
    }

    _createExamples(container) {
        const panel = new ExampleBrowser(container.element, {
            onSelect: (node) => {
                if (node.type === 'file') {
                    this.app.getNotebook()?.loadDemoFile(node.path, { autoRun: true, clearFirst: true });
                }
            }
        });
        panel.initialize();
        this.app.registerComponent('examples', panel);
    }
}
