import { Component } from './Component.js';
import { FluentUI } from '../utils/FluentUI.js';
import { ReactiveState } from '../core/ReactiveState.js';
import { eventBus } from '../core/EventBus.js';

export class ReasoningSettingsPanel extends Component {
    constructor(container) {
        super(container);
        this.state = new ReactiveState({
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
                'Inference': '#FFaa00' // Default
            }
        });

        this.state.watch('*', () => this.emitSettings());
    }

    render() {
        this.fluent().clear().class('settings-panel').style({ padding: '10px', color: '#ccc', fontSize: '12px' });

        const addToggle = (label, prop) => {
            const row = FluentUI.create('div').style({ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' });
            row.child(FluentUI.create('span').text(label));
            row.child(FluentUI.create('input').attr({ type: 'checkbox', checked: this.state[prop] })
                .on('change', (e) => this.state[prop] = e.target.checked));
            this.fluent().child(row);
        };

        const addSlider = (label, prop, min, max, step) => {
            const row = FluentUI.create('div').style({ marginBottom: '8px' });
            const header = FluentUI.create('div').style({ display: 'flex', justifyContent: 'space-between' });
            header.child(FluentUI.create('span').text(label));
            const val = FluentUI.create('span').text(this.state[prop]);
            header.child(val);

            const input = FluentUI.create('input').attr({ type: 'range', min, max, step, value: this.state[prop] })
                .style({ width: '100%' })
                .on('input', (e) => {
                    const v = parseFloat(e.target.value);
                    this.state[prop] = v;
                    val.text(v);
                });

            row.child(header).child(input);
            this.fluent().child(row);
        };

        this.fluent().child(FluentUI.create('h3').text('Visualization Settings').style({ margin: '0 0 10px 0', fontSize: '14px', color: '#00ff9d' }));

        addToggle('Show Derivations', 'showDerivations');
        addToggle('Color Code Rules', 'colorCodeRules');
        addToggle('Attention Spotlight', 'attentionSpotlight');
        addSlider('Animation Speed', 'edgeSpeed', 0.1, 5.0, 0.1);
        addSlider('Trace Decay (ms)', 'traceDecay', 500, 10000, 500);

        // Legend/Color Config
        if (this.state.colorCodeRules) {
            this.fluent().child(FluentUI.create('h4').text('Inference Colors').style({ margin: '10px 0 5px 0', fontSize: '12px' }));
            Object.entries(this.state.inferenceTypeColors).forEach(([rule, color]) => {
                const row = FluentUI.create('div').style({ display: 'flex', alignItems: 'center', marginBottom: '4px' });
                const picker = FluentUI.create('input').attr({ type: 'color', value: color })
                    .style({ width: '20px', height: '20px', border: 'none', background: 'none', marginRight: '8px' })
                    .on('change', (e) => {
                        this.state.inferenceTypeColors[rule] = e.target.value;
                        this.emitSettings(); // Force update
                    });
                row.child(picker).child(FluentUI.create('span').text(rule));
                this.fluent().child(row);
            });
        }
    }

    emitSettings() {
        // Debounce slightly?
        eventBus.emit('visualization.settings', { ...this.state });
        // Re-render if conditional UI changed
        this.render();
    }
}
