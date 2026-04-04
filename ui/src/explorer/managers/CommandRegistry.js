import { ShortcutsModal } from '../../components/ShortcutsModal.js';

export class CommandRegistry {
    constructor(app) {
        this.app = app;
        this.commandPalette = app.commandPalette;
    }

    registerAll() {
        this._registerNavigation();
        this._registerData();
        this._registerFile();
        this._registerSystem();
        this._registerView();
        this._registerDemos();
    }

    _registerNavigation() {
        const { commandPalette: cp, app } = this;
        cp.registerCommand('fit', 'Fit View to Graph', 'F', () => app.graph.fit(), 'Navigation');
        cp.registerCommand('zoom-in', 'Zoom In', '+', () => app.graph.zoomIn(), 'Navigation');
        cp.registerCommand('zoom-out', 'Zoom Out', '-', () => app.graph.zoomOut(), 'Navigation');
        cp.registerCommand('layout', 'Re-calculate Layout', 'L', () => app.graph.scheduleLayout(), 'Navigation');
        cp.registerCommand('go-back', 'Go Back (History)', 'Esc', () => app.graph.goBack?.(), 'Navigation');
    }

    _registerData() {
        const { commandPalette: cp, app } = this;
        cp.registerCommand('clear', 'Clear Workspace', null, () => { app.graph.clear(); app.log('Workspace cleared', 'system'); }, 'Data');
        cp.registerCommand('add-concept', 'Add New Concept', 'A', () => this.handleAddConcept(), 'Data');
        cp.registerCommand('link', 'Link Selected Nodes', null, () => this.handleAddLink(), 'Data');
        cp.registerCommand('delete', 'Delete Selected', 'Del', () => this.handleDelete(), 'Data');
    }

    _registerFile() {
        const { commandPalette: cp, app } = this;
        cp.registerCommand('save', 'Save Graph (JSON)', 'Ctrl+S', () => app.fileManager.handleSaveJSON(), 'File');
        cp.registerCommand('load', 'Load Graph (JSON)', 'Ctrl+O', () => app.fileManager.handleLoadJSON(), 'File');
        cp.registerCommand('import-csv', 'Import Graph (CSV)', null, () => app.fileManager.handleImportCSV(), 'File');
        cp.registerCommand('export-png', 'Export PNG', null, () => app.fileManager.handleExportImage('png'), 'File');
        cp.registerCommand('export-svg', 'Export SVG', null, () => app.fileManager.handleExportImage('svg'), 'File');
    }

    _registerSystem() {
        const { commandPalette: cp, app } = this;
        cp.registerCommand('toggle-decay', 'Toggle Attention Decay', null, () => this.toggleDecay(), 'System');
        cp.registerCommand('run', 'Run Reasoner', 'Space', () => app.toggleReasoner(!app.isReasonerRunning), 'System');
        cp.registerCommand('step', 'Step Reasoner', 'S', () => app.stepReasoner(), 'System');
        cp.registerCommand('step-10', 'Step 10 Cycles', 'Shift+S', () => app.stepReasoner(10), 'System');
        cp.registerCommand('step-50', 'Step 50 Cycles', 'Alt+S', () => app.stepReasoner(50), 'System');
    }

    _registerView() {
        const { commandPalette: cp, app } = this;
        const togglePanel = (id) => app.toggleWidget(id);
        cp.registerCommand('mode-vis', 'Switch to Visualization Mode', null, () => this.setMode('visualization'), 'View');
        cp.registerCommand('mode-ctl', 'Switch to Control Mode', null, () => this.setMode('control'), 'View');
        cp.registerCommand('toggle-focus', 'Toggle Focus Mode', null, () => app.toggleFocusMode(), 'View');
        cp.registerCommand('toggle-fullscreen', 'Toggle Fullscreen', null, () => app.handleToggleFullscreen(), 'View');
        cp.registerCommand('toggle-layers', 'Toggle Layers Panel', null, () => togglePanel('layers'), 'View');
        cp.registerCommand('toggle-metrics', 'Toggle Metrics Panel', null, () => togglePanel('metrics'), 'View');
        cp.registerCommand('toggle-log', 'Toggle Log Panel', null, () => togglePanel('log'), 'View');
        cp.registerCommand('toggle-inspector', 'Toggle Inspector Panel', null, () => togglePanel('inspector'), 'View');
        cp.registerCommand('toggle-tasks', 'Toggle Task Browser', null, () => togglePanel('tasks'), 'View');
    }

    _registerDemos() {
        const { commandPalette: cp } = this;
        cp.registerCommand('demos', 'Browse Demo Library', 'D', () => this.showDemoLibrary(), 'Demos');
    }

    handleMenuAction(action) {
        const { app } = this;
        const actions = {
            'save': () => app.fileManager.handleSaveJSON(),
            'load': () => app.fileManager.handleLoadJSON(),
            'import-csv': () => app.fileManager.handleImportCSV(),
            'export-png': () => app.fileManager.handleExportImage('png'),
            'export-svg': () => app.fileManager.handleExportImage('svg'),
            'add-concept': () => this.handleAddConcept(),
            'add-link': () => this.handleAddLink(),
            'delete': () => this.handleDelete(),
            'fit': () => app.graph.fit(),
            'layout': () => app.graph.scheduleLayout(),
            'focus-mode': () => app.toggleFocusMode(),
            'fullscreen': () => app.handleToggleFullscreen(),
            'clear': () => { app.graph.clear(); app.log('Workspace cleared.', 'system'); },
            'shortcuts': () => new ShortcutsModal().show()
        };
        actions[action]?.() ?? console.warn('Unknown menu action:', action);
    }

    handleAddConcept(position = null) {
        const input = prompt("Enter concept name (or type:name):");
        if (!input) return;
        let term = input.trim();
        let type = 'concept';
        const colonIndex = term.indexOf(':');
        if (colonIndex > 0) {
            type = term.substring(0, colonIndex).trim();
            term = term.substring(colonIndex + 1).trim();
        }
        if (!term) { this.app.log("Invalid concept name.", "warning"); return; }
        this.app.graph.addNode({ id: term, term, budget: { priority: 0.5 }, type, position }, true);
        this.app.log(`Created ${type}: ${term}`, 'success');
    }

    handleAddLink() {
        if (!this.app.graph.cy) return;
        const selected = this.app.graph.cy.$(':selected');
        if (selected.length !== 2) { alert("Please select exactly two nodes to link."); return; }
        const source = selected[0].id();
        const target = selected[1].id();
        const type = prompt(`Link ${source} -> ${target} as:`, 'implication');
        if (type) {
            this.app.graph.addEdge({ source, target, type }, true);
            this.app.log(`Linked ${source} -> ${target} (${type})`, 'user');
        }
    }

    handleDelete() {
        if (!this.app.graph.cy) return;
        const selected = this.app.graph.cy.$(':selected');
        if (selected.empty()) return;
        if (confirm(`Delete ${selected.length} items?`)) {
            const nodeIds = [];
            selected.forEach(ele => {
                if (ele.isNode()) nodeIds.push(ele.id());
                else if (ele.isEdge()) ele.remove();
            });
            if (nodeIds.length > 0) {
                if (this.app.graph.removeNodes) this.app.graph.removeNodes(nodeIds);
                else nodeIds.forEach(id => this.app.graph.removeNode?.(id));
            }
            this.app.log(`Deleted ${selected.length} items.`, 'user');
        }
    }

    toggleDecay(forceState) {
        this.app.isDecayEnabled = forceState !== undefined ? forceState : !this.app.isDecayEnabled;
        if (this.app.isDecayEnabled) {
            this.app.log('Attention Decay: ON', 'system');
            this.app.decayLoopId = setInterval(() => this._processDecay(), 1000);
        } else {
            this.app.log('Attention Decay: OFF', 'system');
            clearInterval(this.app.decayLoopId);
        }
    }

    setMode(mode) {
        this.app.mode = mode;
        this.app.graph.cy.autoungrabify(mode === 'visualization');
        const toolbar = document.getElementById('control-toolbar');
        const toolbarWidget = document.getElementById('controls-widget');
        if (toolbar) toolbar.classList.toggle('hidden', mode !== 'control');
        if (toolbarWidget) toolbarWidget.classList.toggle('hidden', mode !== 'control');
    }

    showDemoLibrary() {
        this.app._inputManager?.showDemoLibrary();
    }

    _processDecay() {
        if (this.app.graph.processDecay) this.app.graph.processDecay(0.98, 0.05);
    }
}
