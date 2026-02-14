import { Component } from './Component.js';
import { FluentUI } from '../utils/FluentUI.js';
import { ReactiveState } from '../core/ReactiveState.js';
import { eventBus } from '../core/EventBus.js';
import { GraphConfig } from '../config/GraphConfig.js';
import { EVENTS } from '../config/constants.js';

export class VisualizationPanel extends Component {
    constructor(container) {
        super(container);

        const savedLayout = localStorage.getItem('senars-graph-layout') || 'fcose';
        const physics = GraphConfig.getGraphLayout('fcose');

        this.state = new ReactiveState({
            // View & Layout
            viewMode: savedLayout,
            scatterAxes: { x: 'priority', y: 'confidence' },

            // Filters
            showTasks: true,
            minPriority: 0,
            hideIsolated: false,

            // Physics (initial values from GraphConfig)
            gravity: physics.gravity || 0.25,
            nodeRepulsion: physics.nodeRepulsion || 450000,
            idealEdgeLength: physics.idealEdgeLength || 100,

            // Reasoning / Visualization
            edgeSpeed: 1.0,
            showDerivations: true,
            colorCodeRules: false,
            traceDecay: 2000,
            attentionSpotlight: false,
            inferenceTypeColors: {
                'Deduction': '#00ff9d',
                'Induction': '#00d4ff',
                'Abduction': '#ffcc00',
                'Revision': '#ff4444',
                'Analogy': '#ff00ff',
                'Inference': '#FFaa00'
            }
        });

        // Watchers
        this.state.watch('*', (key, val) => this._onStateChange(key, val));
    }

    initialize() {
        if (!this.container) return;
        this.render();
        // Emit initial state
        setTimeout(() => this._broadcastAll(), 100);
    }

    render() {
        this.fluent().clear().class('visualization-panel').style({ padding: '10px', color: '#ccc', fontSize: '12px', overflowY: 'auto', height: '100%' });

        this._renderLayoutSection();
        this._renderFilterSection();
        this._renderPhysicsSection();
        this._renderAppearanceSection();
        this._renderReasoningSection();
    }

    _renderLayoutSection() {
        this._renderSectionHeader('Layout & View');
        const container = this.fluent().child(FluentUI.create('div').class('panel-section'));

        // Layout Selector
        const layoutRow = FluentUI.create('div').class('control-row').style({ marginBottom: '8px', display: 'flex', alignItems: 'center' });
        layoutRow.child(FluentUI.create('label').text('Layout: ').style({ marginRight: '8px' }));

        const options = [
            { value: 'fcose', label: 'Force Graph' },
            { value: 'grid', label: 'Grid' },
            { value: 'circle', label: 'Circle' },
            { value: 'scatter', label: 'Scatter Plot' },
            { value: 'sorted-grid', label: 'Sorted Grid' }
        ];

        const select = FluentUI.create('select')
            .class('panel-select')
            .style({ background: '#333', color: '#eee', border: '1px solid #444', padding: '4px', borderRadius: '3px', flex: '1' })
            .on('change', (e) => this.state.viewMode = e.target.value)
            .children(options.map(opt =>
                FluentUI.create('option').attr({ value: opt.value }).text(opt.label).prop({ selected: this.state.viewMode === opt.value })
            ));

        layoutRow.child(select);
        container.child(layoutRow);

        // Scatter Axes (Conditional)
        if (this.state.viewMode === 'scatter') {
             container.child(this._createScatterControls());
        }
    }

    _createScatterControls() {
        const axes = ['priority', 'confidence', 'frequency', 'durability', 'quality', 'taskCount'];
        const container = FluentUI.create('div').class('scatter-controls').style({ marginTop: '5px', paddingLeft: '10px', borderLeft: '2px solid #444' });

        ['x', 'y'].forEach(axis => {
            const row = FluentUI.create('div').style({ marginBottom: '4px', display: 'flex', alignItems: 'center' });
            row.child(FluentUI.create('span').text(`${axis.toUpperCase()}: `).style({ width: '20px', display: 'inline-block' }));

            const select = FluentUI.create('select')
                .class('panel-select-mini')
                .style({ background: '#222', color: '#ccc', border: '1px solid #333', fontSize: '11px', padding: '2px', flex: '1' })
                .on('change', (e) => {
                    this.state.scatterAxes = { ...this.state.scatterAxes, [axis]: e.target.value };
                })
                .children(axes.map(opt =>
                    FluentUI.create('option').attr({ value: opt }).text(opt).prop({ selected: this.state.scatterAxes[axis] === opt })
                ));

            row.child(select);
            container.child(row);
        });
        return container;
    }

    _renderFilterSection() {
        this._renderSectionHeader('Filters');
        const container = this.fluent().child(FluentUI.create('div').class('panel-section'));

        this._createToggle(container, 'Show Tasks', 'showTasks');
        this._createToggle(container, 'Hide Isolated Nodes', 'hideIsolated');
        this._createSlider(container, 'Min Priority', 'minPriority', 0, 1, 0.05);
    }

    _renderPhysicsSection() {
        this._renderSectionHeader('Graph Physics (Force)');
        const container = this.fluent().child(FluentUI.create('div').class('panel-section'));

        this._createSlider(container, 'Gravity', 'gravity', 0, 1, 0.05);
        this._createSlider(container, 'Repulsion', 'nodeRepulsion', 100000, 1000000, 50000);
        this._createSlider(container, 'Edge Length', 'idealEdgeLength', 50, 300, 10);
    }

    _renderAppearanceSection() {
        this._renderSectionHeader('Appearance');
        const container = this.fluent().child(FluentUI.create('div').class('panel-section'));

        const colors = ['CONCEPT', 'TASK', 'QUESTION', 'HIGHLIGHT'];
        colors.forEach(key => {
            const val = GraphConfig.COLORS[key] || '#ffffff';
            const row = FluentUI.create('div').style({ display: 'flex', alignItems: 'center', marginBottom: '4px' });

            const picker = FluentUI.create('input').attr({ type: 'color', value: val })
                .style({ width: '20px', height: '20px', border: 'none', background: 'none', marginRight: '8px', cursor: 'pointer' })
                .on('change', (e) => {
                    GraphConfig.COLORS[key] = e.target.value;
                    GraphConfig.save();
                    eventBus.emit(EVENTS.SETTINGS_UPDATED); // Notify others
                });

            row.child(picker).child(FluentUI.create('span').text(key));
            container.child(row);
        });
    }

    _renderReasoningSection() {
        this._renderSectionHeader('Reasoning Visualization');
        const container = this.fluent().child(FluentUI.create('div').class('panel-section'));

        this._createToggle(container, 'Show Derivations', 'showDerivations');
        this._createToggle(container, 'Color Code Rules', 'colorCodeRules');
        this._createToggle(container, 'Attention Spotlight', 'attentionSpotlight');
        this._createSlider(container, 'Animation Speed', 'edgeSpeed', 0.1, 5.0, 0.1);
        this._createSlider(container, 'Trace Decay (ms)', 'traceDecay', 500, 10000, 500);

        if (this.state.colorCodeRules) {
            container.child(FluentUI.create('h4').text('Inference Colors').style({ margin: '10px 0 5px 0', fontSize: '11px', color: '#888' }));
            Object.entries(this.state.inferenceTypeColors).forEach(([rule, color]) => {
                const row = FluentUI.create('div').style({ display: 'flex', alignItems: 'center', marginBottom: '4px' });
                const picker = FluentUI.create('input').attr({ type: 'color', value: color })
                    .style({ width: '16px', height: '16px', border: 'none', background: 'none', marginRight: '8px' })
                    .on('change', (e) => {
                        this.state.inferenceTypeColors[rule] = e.target.value;
                        // Trigger update
                        this._onStateChange('inferenceTypeColors', this.state.inferenceTypeColors);
                    });
                row.child(picker).child(FluentUI.create('span').text(rule).style({ fontSize: '11px' }));
                container.child(row);
            });
        }
    }

    _renderSectionHeader(title) {
        this.fluent().child(
            FluentUI.create('h3')
                .text(title)
                .style({ margin: '10px 0 5px 0', fontSize: '13px', color: '#00ff9d', borderBottom: '1px solid #333', paddingBottom: '2px' })
        );
    }

    _createToggle(parent, label, prop) {
        const row = FluentUI.create('div').style({ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' });
        row.child(FluentUI.create('span').text(label));
        row.child(FluentUI.create('input').attr({ type: 'checkbox', checked: this.state[prop] })
            .on('change', (e) => this.state[prop] = e.target.checked));
        parent.child(row);
    }

    _createSlider(parent, label, prop, min, max, step) {
        const row = FluentUI.create('div').style({ marginBottom: '6px' });
        const header = FluentUI.create('div').style({ display: 'flex', justifyContent: 'space-between' });
        header.child(FluentUI.create('span').text(label));
        const valSpan = FluentUI.create('span').text(this.state[prop]).style({ color: '#00d4ff' });
        header.child(valSpan);

        const input = FluentUI.create('input')
            .attr({ type: 'range', min, max, step, value: this.state[prop] })
            .style({ width: '100%' })
            .on('input', (e) => {
                const v = parseFloat(e.target.value);
                this.state[prop] = v;
                valSpan.text(v);
            });

        row.child(header).child(input);
        parent.child(row);
    }

    _onStateChange(key, val) {
        // Persist Layout
        if (key === 'viewMode') {
            localStorage.setItem('senars-graph-layout', val);
            // Re-render if switching to scatter to show/hide axes
            // Only re-render layout section ideally, but full render is fine for now
            this.render();
        }

        // Re-render if color code rules toggled
        if (key === 'colorCodeRules') {
            this.render();
        }

        // Persist Physics overrides
        if (['gravity', 'nodeRepulsion', 'idealEdgeLength'].includes(key)) {
            if (!GraphConfig.OVERRIDES) GraphConfig.OVERRIDES = {};
            GraphConfig.OVERRIDES[key] = val;
            GraphConfig.save();
        }

        this._broadcastAll();
    }

    _broadcastAll() {
        // Broadcast generic settings
        eventBus.emit('visualization.settings', { ...this.state });

        // Broadcast filters explicitly for GraphPanel
        eventBus.emit(EVENTS.GRAPH_FILTER, {
            showTasks: this.state.showTasks,
            minPriority: this.state.minPriority,
            hideIsolated: this.state.hideIsolated
        });
    }
}
