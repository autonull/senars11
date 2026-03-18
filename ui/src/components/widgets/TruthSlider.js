import { Component } from '../Component.js';
import { FluentUI } from '../../utils/FluentUI.js';

export class TruthSlider extends Component {
    constructor(container, options = {}) {
        super(container);
        this.frequency = options.frequency ?? 0.5;
        this.confidence = options.confidence ?? 0.9;
        this.onChange = options.onChange || (() => {});
    }

    render() {
        if (!this.container) return;

        this.fluent().clear().class('truth-slider-widget')
            .style({ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', width: '100%', border: '1px solid var(--border-color)' })
            .child(
                FluentUI.create('div')
                    .text('Truth Value Adjustment')
                    .style({ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' })
            );

        this.createSlider('Frequency', this.frequency, (val) => {
            this.frequency = val;
            this.notify();
        });

        this.createSlider('Confidence', this.confidence, (val) => {
            this.confidence = val;
            this.notify();
        });

        this.valueDisplay = FluentUI.create('div')
            .style({
                marginTop: '10px', fontFamily: 'var(--font-mono)', textAlign: 'center', color: 'var(--accent-primary)',
                fontSize: '14px', background: 'rgba(0,0,0,0.3)', padding: '5px', borderRadius: '3px',
                transition: 'all 0.2s', border: '1px solid transparent'
            })
            .mount(this.container)
            .dom;

        this.updateDisplay();
    }

    createSlider(label, value, callback) {
        const valueEl = FluentUI.create('span')
            .text(value.toFixed(2))
            .style({ width: '35px', fontSize: '11px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--text-main)' });

        const slider = FluentUI.create('input')
            .attr({ type: 'range', min: 0, max: 1, step: 0.01, value })
            .style({ flex: '1', cursor: 'pointer', accentColor: 'var(--accent-primary)' })
            .on('input', (e) => {
                const val = parseFloat(e.target.value);
                valueEl.text(val.toFixed(2));
                callback(val);
            });

        FluentUI.create('div')
            .style({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' })
            .child(
                FluentUI.create('label')
                    .text(label)
                    .style({ width: '70px', fontSize: '11px', color: 'var(--text-main)' })
            )
            .child(slider)
            .child(valueEl)
            .mount(this.container);
    }

    updateDisplay() {
        if (this.valueDisplay) {
            this.valueDisplay.textContent = `{${this.frequency.toFixed(2)} ${this.confidence.toFixed(2)}}`;

            // Visual feedback: border color based on confidence, background opacity based on frequency
            // High confidence = solid Green
            // Low confidence = Red/Orange

            let color = '#555';
            if (this.confidence > 0.9) color = '#00ff9d';
            else if (this.confidence > 0.5) color = '#ffcc00';
            else color = '#ff4444';

            this.valueDisplay.style.borderColor = color;
            this.valueDisplay.style.background = `rgba(${this.frequency * 255}, ${this.frequency * 255}, 255, 0.1)`;
        }
    }

    notify() {
        this.updateDisplay();
        this.onChange({ frequency: this.frequency, confidence: this.confidence });
    }
}
