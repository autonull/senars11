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

    initialize({ onModeSwitch, onThemeToggle, onReasonerControl, onReplSubmit, onWidgetToggle, onConfig, onMenuAction }) {
        this.onModeSwitch = onModeSwitch;
        this.onThemeToggle = onThemeToggle;
        this.onReasonerControl = onReasonerControl;
        this.onReplSubmit = onReplSubmit;
        this.onWidgetToggle = onWidgetToggle;
        this.onConfig = onConfig;
        this.onMenuAction = onMenuAction;
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="status-bar">
                <!-- Left section: Menus & REPL -->
                <div class="status-left-section">
                    <div class="status-menus">
                        <div class="status-menu-item">
                            <button class="status-menu-btn">File</button>
                            <div class="status-menu-dropdown">
                                <button data-action="save">Save Graph (JSON)...</button>
                                <button data-action="load">Load Graph (JSON)...</button>
                                <div class="menu-divider"></div>
                                <button data-action="export-png">Export PNG</button>
                                <button data-action="export-svg">Export SVG</button>
                            </div>
                        </div>
                        <div class="status-menu-item">
                            <button class="status-menu-btn">Edit</button>
                            <div class="status-menu-dropdown">
                                <button data-action="add-concept">Add Node</button>
                                <button data-action="add-link">Link Nodes</button>
                                <button data-action="delete">Delete Selected</button>
                                <div class="menu-divider"></div>
                                <button data-action="clear" class="danger">Clear All</button>
                            </div>
                        </div>
                        <div class="status-menu-item">
                            <button class="status-menu-btn">View</button>
                            <div class="status-menu-dropdown">
                                <button data-action="fit">Fit View</button>
                                <button data-action="layout">Auto Layout</button>
                                <div class="menu-divider"></div>
                                <button data-action="fullscreen">Toggle Fullscreen</button>
                            </div>
                        </div>
                        <div class="status-menu-item">
                            <button class="status-menu-btn">Help</button>
                            <div class="status-menu-dropdown">
                                <button data-action="shortcuts">Keyboard Shortcuts</button>
                            </div>
                        </div>
                    </div>
                    <div class="status-repl-wrapper">
                        <span class="repl-prompt">&gt;</span>
                        <textarea id="status-repl-input"
                                  class="status-repl-input"
                                  rows="1"
                                  placeholder="Command or chat..."
                                  autocomplete="off"></textarea>
                    </div>
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
                    <!-- Global Toolbar Items Moved from LogPanel/Toolbar -->
                    <div class="status-toolbar-items">
                        <div style="display: flex; align-items: center; position: relative;">
                            <input type="text" id="search-input" placeholder="Search..." class="control-input-small">
                            <button id="btn-clear-search" class="status-btn-small" style="position: absolute; right: 2px; font-size: 0.8em; display: none;">✕</button>
                        </div>
                        <select id="demo-select" class="control-select-small">
                            <option value="" disabled selected>Load Demo...</option>
                        </select>
                         <button id="btn-clear" class="status-btn-small warning" title="Clear Workspace">🗑️</button>
                    </div>

                    <div class="status-divider"></div>

                    <div class="status-metric" id="status-cycles">📊 Cycles: 0</div>
                    <div class="status-metric" id="status-nodes">🧠 Nodes: 0/50</div>
                    <div class="status-metric" id="status-tps">⚡ TPS: 0</div>
                    <div class="status-divider"></div>
                    <div id="llm-status" class="status-indicator status-offline">Offline</div>
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
        this._bindMenuEvents();
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

        // Submit on Enter (unless Shift is held), or Ctrl+Enter
        repl.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                const command = repl.value.trim();
                if (command) {
                    this.onReplSubmit?.(command);
                    repl.value = '';
                }
            }
        });
    }

    _bindMenuEvents() {
        // Toggle dropdowns
        const menuBtns = this.container.querySelectorAll('.status-menu-btn');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close others
                this.container.querySelectorAll('.status-menu-item.active').forEach(item => {
                    if (item !== btn.parentNode) item.classList.remove('active');
                });
                btn.parentNode.classList.toggle('active');
            });
        });

        // Close dropdowns on click outside
        document.addEventListener('click', () => {
            this.container.querySelectorAll('.status-menu-item.active').forEach(item => {
                item.classList.remove('active');
            });
        });

        // Menu actions
        const actionBtns = this.container.querySelectorAll('.status-menu-dropdown button[data-action]');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (this.onMenuAction) this.onMenuAction(action);
                // Close menu
                btn.closest('.status-menu-item').classList.remove('active');
            });
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
                btnRun.classList.add('active-pulse');
                this.onReasonerControl?.('run');
            });
        }

        if (btnPause) {
            btnPause.addEventListener('click', () => {
                const runBtn = document.getElementById('status-btn-run');
                if (runBtn) runBtn.classList.remove('active-pulse');
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

        const configBtn = document.getElementById('status-config');
        if (configBtn) {
            configBtn.style.cursor = 'pointer';
            configBtn.addEventListener('click', () => {
                this.onConfig?.();
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
        const cyclesEl = this.container.querySelector('#status-cycles');
        const nodesEl = this.container.querySelector('#status-nodes');
        const tpsEl = this.container.querySelector('#status-tps');

        if (cyclesEl) cyclesEl.textContent = `📊 Cycles: ${stats.cycles || 0}`;
        // Prefer "active" (visible) nodes if passed, otherwise backend stats
        const activeNodes = stats.activeNodes !== undefined ? stats.activeNodes : (stats.nodes || 0);
        if (nodesEl) nodesEl.textContent = `🧠 Nodes: ${activeNodes}/${stats.maxNodes || 50}`;
        if (tpsEl) tpsEl.textContent = `⚡ TPS: ${stats.tps || 0}`;
    }

    setReasonerRunning(isRunning) {
        const btnRun = this.container.querySelector('#status-btn-run');
        const btnPause = this.container.querySelector('#status-btn-pause');

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
