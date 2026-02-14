import { Component } from './Component.js';

export class StatusBar extends Component {
    constructor(container) {
        super(container);
        this.mode = 'local';
        this.status = 'Ready';
        this.stats = {
            cycles: 0,
            messages: 0,
            latency: 0
        };
        this.onModeSwitch = null;

        this.els = {
            mode: null,
            status: null,
            cycles: null,
            messages: null,
            latency: null
        };
    }

    initialize({ onModeSwitch }) {
        this.onModeSwitch = onModeSwitch;
        this.render();
    }

    render() {
        if (!this.container) return;

        // Build DOM once
        if (this.els.mode) return;

        this.container.innerHTML = '';
        this.container.className = 'status-bar';
        this.container.style.cssText = `
            height: 24px;
            background: #007acc;
            color: white;
            display: flex;
            align-items: center;
            padding: 0 10px;
            font-size: 12px;
            font-family: var(--font-mono);
            user-select: none;
            justify-content: space-between;
        `;

        // Left: Connection Mode & Status
        const leftSection = document.createElement('div');
        leftSection.style.cssText = 'display: flex; align-items: center; gap: 15px;';

        this.els.mode = document.createElement('div');
        this.els.mode.style.cssText = 'cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: bold;';
        this.els.mode.title = 'Click to switch connection mode';
        this.els.mode.onclick = () => this.onModeSwitch?.();

        this.els.status = document.createElement('div');

        leftSection.append(this.els.mode, this.els.status);

        // Right: Stats
        const rightSection = document.createElement('div');
        rightSection.style.cssText = 'display: flex; gap: 15px;';

        this.els.cycles = document.createElement('div');
        this.els.messages = document.createElement('div');
        this.els.latency = document.createElement('div');

        rightSection.append(this.els.cycles, this.els.messages, this.els.latency);

        this.container.append(leftSection, rightSection);

        this._refreshAll();
    }

    _refreshAll() {
        this._updateModeDisplay();
        this._updateStatusDisplay();
        this._updateStatsDisplay();
    }

    _updateModeDisplay() {
        if (!this.els.mode) return;
        this.els.mode.innerHTML = this.mode === 'local' ? '💻 Local Mode' : '🌐 Remote Mode';
        if (this.els.latency) {
            this.els.latency.style.display = this.mode === 'remote' ? 'block' : 'none';
        }
    }

    _updateStatusDisplay() {
        if (!this.els.status) return;
        this.els.status.textContent = this.status;
    }

    _updateStatsDisplay() {
        if (!this.els.cycles) return;
        this.els.cycles.textContent = `Cycles: ${this.stats.cycles}`;
        this.els.messages.textContent = `Msgs: ${this.stats.messages}`;
        if (this.mode === 'remote') {
            this.els.latency.textContent = `Ping: ${this.stats.latency}ms`;
        }
    }

    updateMode(mode) {
        if (this.mode !== mode) {
            this.mode = mode;
            this._updateModeDisplay();
        }
    }

    updateStatus(status) {
        if (this.status !== status) {
            this.status = status;
            this._updateStatusDisplay();
        }
    }

    updateStats(stats = {}) {
        this.stats = { ...this.stats, ...stats };
        this._updateStatsDisplay();
    }
}
