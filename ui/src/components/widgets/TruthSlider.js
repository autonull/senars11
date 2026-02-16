import { Component } from '../Component.js';

export class TruthSlider extends Component {
    constructor(container, options = {}) {
        super(container);
        this.frequency = options.frequency ?? 0.5;
        this.confidence = options.confidence ?? 0.9;
        this.onChange = options.onChange || (() => {});
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.className = 'truth-slider-widget';
        this.container.style.cssText = 'padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; width: 100%; border: 1px solid var(--border-color);';

        const title = document.createElement('div');
        title.textContent = 'Truth Value Adjustment';
        title.style.cssText = 'font-size: 11px; font-weight: bold; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;';
        this.container.appendChild(title);

        this.createSlider('Frequency', this.frequency, (val) => {
            this.frequency = val;
            this.notify();
        });

        this.createSlider('Confidence', this.confidence, (val) => {
            this.confidence = val;
            this.notify();
        });

        // Visualization of truth value
        this.valueDisplay = document.createElement('div');
        this.valueDisplay.style.cssText = 'margin-top: 10px; font-family: var(--font-mono); text-align: center; color: var(--accent-primary); font-size: 14px; background: rgba(0,0,0,0.3); padding: 5px; border-radius: 3px; transition: all 0.2s; border: 1px solid transparent;';
        this.updateDisplay();
        this.container.appendChild(this.valueDisplay);
    }

    createSlider(label, value, callback) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 5px;';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.style.cssText = 'width: 70px; font-size: 11px; color: var(--text-main);';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 0;
        slider.max = 1;
        slider.step = 0.01;
        slider.value = value;
        slider.style.cssText = 'flex: 1; cursor: pointer; accent-color: var(--accent-primary);';

        const valueEl = document.createElement('span');
        valueEl.textContent = value.toFixed(2);
        valueEl.style.cssText = 'width: 35px; font-size: 11px; font-family: var(--font-mono); text-align: right; color: var(--text-main);';

        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            valueEl.textContent = val.toFixed(2);
            callback(val);
        });

        wrapper.append(labelEl, slider, valueEl);
        this.container.appendChild(wrapper);
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
