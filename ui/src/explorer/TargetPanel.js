import { Component } from './Component.js';

export class TargetPanel extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="hud-panel target-panel hidden">
                <div class="hud-header">
                    <span class="hud-title">TARGET ACQUIRED</span>
                </div>
                <div class="target-data">
                    <div class="target-row">
                        <span class="label">TERM</span>
                        <span class="value" id="target-term">--</span>
                    </div>
                    <div class="target-row">
                        <span class="label">PRIORITY</span>
                        <div class="bar-container">
                            <div class="bar-fill" id="target-priority-bar" style="width: 0%"></div>
                        </div>
                        <span class="value-small" id="target-priority">0.00</span>
                    </div>
                    <div class="target-row">
                        <span class="label">TYPE</span>
                        <span class="value" id="target-type">--</span>
                    </div>
                </div>
            </div>
        `;
    }

    update(data) {
        if (!this.container) return;

        const panel = this.container.querySelector('.target-panel');
        if (panel) panel.classList.remove('hidden');

        this._setText('target-term', data.label || data.id);
        this._setText('target-type', (data.type || 'CONCEPT').toUpperCase());
        this._setText('target-priority', (data.priority || 0).toFixed(2));

        const bar = this.container.querySelector('#target-priority-bar');
        if (bar) bar.style.width = `${(data.priority || 0) * 100}%`;
    }

    clear() {
        if (!this.container) return;
        const panel = this.container.querySelector('.target-panel');
        if (panel) panel.classList.add('hidden');
    }

    _setText(id, text) {
        const el = this.container.querySelector(`#${id}`);
        if (el) el.textContent = text;
    }
}
