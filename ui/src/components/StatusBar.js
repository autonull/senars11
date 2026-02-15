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
            },
            expanded: false
        });

        this.onModeSwitch = null;
        this.onThemeToggle = null;
        this.onReasonerControl = null;
        this.onReplSubmit = null;
        this.onWidgetToggle = null;
        this._disposables = [];

        // Subscribe to global events
        this._disposables.push(
            eventBus.on('connection.status', (status) => {
                this.state.status = status;
            })
        );
    }

    initialize({ onModeSwitch, onThemeToggle, onReasonerControl, onReplSubmit, onWidgetToggle }) {
        this.onModeSwitch = onModeSwitch;
        this.onThemeToggle = onThemeToggle;
        this.onReasonerControl = onReasonerControl;
        this.onReplSubmit = onReplSubmit;
        this.onWidgetToggle = onWidgetToggle;
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="status-bar">
                <!-- Left section: REPL -->
                <div class="status-repl-section">
                    <span class="repl-prompt">&gt;</span>
                    <textarea id="status-repl-input" 
                              class="status-repl-input" 
                              rows="1"
                              placeholder="Command or chat..."
                              autocomplete="off"></textarea>
                </div>

                <!-- Center section: Reasoner Controls -->
                <div class="status-controls-section">
                    <button id="status-btn-run" class="status-btn" title="Run Reasoner">▶</button>
                    <button id="status-btn-pause" class="status-btn hidden" title="Pause Reasoner">⏸</button>
                    <button id="status-btn-step" class="status-btn" title="Step Reasoner">⏭</button>
                    <div class="status-throttle">
                        <input type="range" id="status-throttle-slider" min="0" max="1000" value="100" step="50" />
                        <span id="status-throttle-value">100ms</span>
                    </div>
                </div>

                <!-- Right section: System Info + Widget Toggles -->
                <div class="status-info-section">
                    <div class="status-metric" id="status-cycles">📊 Cycles: 0</div>
                    <div class="status-metric" id="status-nodes">🧠 Nodes: 0/50</div>
                    <div class="status-metric" id="status-tps">⚡ TPS: 0</div>
                    <div class="status-divider"></div>
                    <button class="widget-toggle-btn active" id="toggle-layers" title="Toggle Layers (1)">📐</button>
                    <button class="widget-toggle-btn active" id="toggle-metrics" title="Toggle Metrics (2)">📊</button>
                    <button class="widget-toggle-btn active" id="toggle-logs" title="Toggle Logs (3)">📝</button>
                    <button class="widget-toggle-btn active" id="toggle-inspector" title="Toggle Inspector (4)">🔍</button>
                    <div class="status-metric status-interactive" id="status-config" title="Config">⚙️</div>
                </div>
            </div>
        `;

        this._bindReplEvents();
        this._bindControlEvents();
        this._bindWidgetToggles();
    }

    _bindWidgetToggles() {
        // Widget toggle buttons
        const toggleButtons = {
            'toggle-layers': 'layers',
            'toggle-metrics': 'metrics',
            'toggle-logs': 'log',
            'toggle-inspector': 'inspector'
        };

        Object.entries(toggleButtons).forEach(([btnId, widgetId]) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => {
                    // Trigger callback to ExplorerApp
                    if (this.onWidgetToggle) {
                        const isVisible = this.onWidgetToggle(widgetId);
                        btn.classList.toggle('active', isVisible);
                    }
                });
            }
        });
    }

    _bindReplEvents() {
        const repl = document.getElementById('status-repl-input');
        if (!repl) return;

        // Expand on focus, collapse on blur
        repl.addEventListener('focus', () => {
            this.state.expanded = true;
            this.container.querySelector('.status-bar').classList.add('status-bar--expanded');
            repl.rows = 3;
        });

        repl.addEventListener('blur', () => {
            // Delay collapse to allow clicking buttons
            setTimeout(() => {
                if (document.activeElement !== repl) {
                    this.state.expanded = false;
                    this.container.querySelector('.status-bar').classList.remove('status-bar--expanded');
                    repl.rows = 1;
                }
            }, 200);
        });

        // Submit on Ctrl+Enter
        repl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const command = repl.value.trim();
                if (command) {
                    this.onReplSubmit?.(command);
                    repl.value = '';
                }
            } else if (e.key === 'Enter' && !e.shiftKey) {
                // Single Enter = submit if not expanded
                if (!this.state.expanded) {
                    e.preventDefault();
                    const command = repl.value.trim();
                    if (command) {
                        this.onReplSubmit?.(command);
                        repl.value = '';
                    }
                }
            }
        });
    }

    _bindControlEvents() {
        const btnRun = document.getElementById('status-btn-run');
        const btnPause = document.getElementById('status-btn-pause');
        const btnStep = document.getElementById('status-btn-step');
        const throttleSlider = document.getElementById('status-throttle-slider');
        const throttleValue = document.getElementById('status-throttle-value');

        if (btnRun) {
            btnRun.addEventListener('click', () => {
                this.onReasonerControl?.('run');
            });
        }

        if (btnPause) {
            btnPause.addEventListener('click', () => {
                this.onReasonerControl?.('pause');
            });
        }

        if (btnStep) {
            btnStep.addEventListener('click', () => {
                this.onReasonerControl?.('step');
            });
        }

        if (throttleSlider && throttleValue) {
            throttleSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                throttleValue.textContent = `${value}ms`;
                this.onReasonerControl?.('throttle', parseInt(value));
            });
        }
    }

    updateMode(mode) {
        this.state.mode = mode;
    }

    updateStatus(status) {
        this.state.status = status;
    }

    updateStats(stats = {}) {
        this.state.stats = { ...this.state.stats, ...stats };

        // Update DOM directly since we're not using reactive bindings here
        const cyclesEl = document.getElementById('status-cycles');
        const nodesEl = document.getElementById('status-nodes');
        const tpsEl = document.getElementById('status-tps');

        if (cyclesEl) cyclesEl.textContent = `📊 Cycles: ${stats.cycles || 0}`;
        if (nodesEl) nodesEl.textContent = `🧠 Nodes: ${stats.nodes || 0}/${stats.maxNodes || 50}`;
        if (tpsEl) tpsEl.textContent = `⚡ TPS: ${stats.tps || 0}`;
    }

    setReasonerRunning(isRunning) {
        const btnRun = document.getElementById('status-btn-run');
        const btnPause = document.getElementById('status-btn-pause');

        if (isRunning) {
            btnRun?.classList.add('hidden');
            btnPause?.classList.remove('hidden');
        } else {
            btnRun?.classList.remove('hidden');
            btnPause?.classList.add('hidden');
        }
    }

    destroy() {
        super.destroy();
        this._disposables.forEach(d => d());
        this._disposables = [];
    }
}
