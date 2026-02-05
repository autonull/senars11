import { Component } from './Component.js';
import { FluentUI, $ } from '../utils/FluentUI.js';
import { ReactiveState } from '../core/ReactiveState.js';
import { eventBus } from '../core/EventBus.js';
import { MODES } from '../config/constants.js';

export class StatusBar extends Component {
    constructor(container) {
        super(container);

        this.state = new ReactiveState({
            mode: MODES.LOCAL,
            status: 'Ready',
            stats: {
                cycles: 0,
                messages: 0,
                latency: 0
            }
        });

        this.onModeSwitch = null;
        this.onThemeToggle = null;
        this._disposables = [];

        // Subscribe to global events
        this._disposables.push(
            eventBus.on('connection.status', (status) => {
                this.state.status = status;
            })
        );
    }

    initialize({ onModeSwitch, onThemeToggle }) {
        this.onModeSwitch = onModeSwitch;
        this.onThemeToggle = onThemeToggle;
        this.render();
    }

    render() {
        if (!this.container) return;

        if (this.container.children.length > 0) {
             this.container.innerHTML = '';
        }

        const $container = $(this.container).class('status-bar');

        const leftSection = $('div').class('status-left-section').mount($container);

        // Mode
        const modeEl = $('div')
            .class('status-mode')
            .attr({ title: 'Click to switch connection mode' })
            .on('click', () => {
                console.log('[StatusBar] Mode switch clicked');
                this.onModeSwitch?.();
            })
            .mount(leftSection);

        this._bind(modeEl, 'mode', (mode) => {
             modeEl.text(mode === MODES.LOCAL ? '💻 Local Mode' : '🌐 Remote Mode');
        });

        // Status
        const statusEl = $('div')
            .id('connection-status')
            .mount(leftSection);

        this._bind(statusEl, 'status', (status) => statusEl.text(status));

        const rightSection = $('div').class('status-right-section').mount($container);

        // Cycles
        const cyclesEl = $('div').mount(rightSection);
        this._bind(cyclesEl, 'stats', (stats) => cyclesEl.text(`Cycles: ${stats.cycles}`));

        // Messages
        const msgsEl = $('div').mount(rightSection);
        this._bind(msgsEl, 'stats', (stats) => msgsEl.text(`Msgs: ${stats.messages}`));

        // Latency
        const latencyEl = $('div').mount(rightSection);

        const updateLatency = () => {
            const visible = this.state.mode === MODES.REMOTE;
            latencyEl.style({ display: visible ? 'block' : 'none' });
            if (visible) latencyEl.text(`Ping: ${this.state.stats.latency}ms`);
        };

        this._disposables.push(this.state.watchAll(['mode', 'stats'], updateLatency));
        updateLatency(); // Initial call

        // Theme
        $('div')
            .class('status-item status-interactive')
            .text('🎨 Theme')
            .attr({ title: 'Toggle Theme' })
            .on('click', () => this.onThemeToggle?.())
            .mount(rightSection);
    }

    _bind(element, prop, handler) {
        // Initial set
        handler(this.state[prop]);
        // Watch
        this._disposables.push(this.state.watch(prop, handler));
    }

    updateMode(mode) {
        this.state.mode = mode;
    }

    updateStatus(status) {
        this.state.status = status;
    }

    updateStats(stats = {}) {
        this.state.stats = { ...this.state.stats, ...stats };
    }

    destroy() {
        super.destroy();
        this._disposables.forEach(d => d());
        this._disposables = [];
    }
}
