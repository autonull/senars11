import { Component } from './Component.js';
import { FluentUI } from '../utils/FluentUI.js';
import { MODES } from '../config/constants.js';

export class StatusBar extends Component {
    constructor(container) {
        super(container);
        this.mode = MODES.LOCAL;
        this.status = 'Ready';
        this.stats = {
            cycles: 0,
            messages: 0,
            latency: 0
        };
        this.onModeSwitch = null;

        this.ui = {
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

        // Prevent re-rendering if already built (unless we want to support full re-renders)
        if (this.ui.mode) return;

        this.container.innerHTML = '';

        FluentUI.create(this.container)
            .class('status-bar')
            .child(
                FluentUI.create('div')
                    .class('status-left-section')
                    .child(
                        this.ui.mode = FluentUI.create('div')
                            .class('status-mode')
                            .attr({ title: 'Click to switch connection mode' })
                            .on('click', (e) => {
                                console.log('[StatusBar] Mode switch clicked');
                                if (this.onModeSwitch) {
                                    this.onModeSwitch();
                                } else {
                                    console.warn('[StatusBar] No onModeSwitch handler defined');
                                }
                            })
                    )
                    .child(
                        this.ui.status = FluentUI.create('div')
                    )
            )
            .child(
                FluentUI.create('div')
                    .class('status-right-section')
                    .child(this.ui.cycles = FluentUI.create('div'))
                    .child(this.ui.messages = FluentUI.create('div'))
                    .child(this.ui.latency = FluentUI.create('div'))
            );

        this._refreshAll();
    }

    _refreshAll() {
        this._updateModeDisplay();
        this._updateStatusDisplay();
        this._updateStatsDisplay();
    }

    _updateModeDisplay() {
        if (!this.ui.mode) return;
        this.ui.mode.text(this.mode === MODES.LOCAL ? '💻 Local Mode' : '🌐 Remote Mode');
        if (this.ui.latency) {
            this.ui.latency.style({ display: this.mode === MODES.REMOTE ? 'block' : 'none' });
        }
    }

    _updateStatusDisplay() {
        if (!this.ui.status) return;
        this.ui.status.text(this.status);
    }

    _updateStatsDisplay() {
        if (!this.ui.cycles) return;
        this.ui.cycles.text(`Cycles: ${this.stats.cycles}`);
        this.ui.messages.text(`Msgs: ${this.stats.messages}`);
        if (this.mode === MODES.REMOTE && this.ui.latency) {
            this.ui.latency.text(`Ping: ${this.stats.latency}ms`);
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
