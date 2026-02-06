import { Component } from '../components/Component.js';

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

        // Prefer clean term/id over visual label (which might have stats)
        const displayTerm = data.term || data.id || data.label || 'Unknown';
        this._setText('target-term', String(displayTerm));
        this._setText('target-type', (data.type || 'CONCEPT').toUpperCase());

        // Handle priority from budget or top-level
        const priority = data.budget?.priority !== undefined ? data.budget.priority : (data.priority || 0);
        this._setText('target-priority', Number(priority).toFixed(2));

        const bar = this.container.querySelector('#target-priority-bar');
        if (bar) bar.style.width = `${Number(priority) * 100}%`;
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
