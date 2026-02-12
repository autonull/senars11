import { Component } from './Component.js';
import { FluentUI, $, div, button, span, input } from '../utils/FluentUI.js';
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
                nodes: 0,
                activeNodes: 0,
                maxNodes: 50,
                tps: 0
            },
            expanded: false
        });

        this.onModeSwitch = null;
        this.onThemeToggle = null;
        this.onReasonerControl = null;
        this.onReplSubmit = null;
        this.onWidgetToggle = null;
        this.onConfig = null;
        this.onMenuAction = null;
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

        // Clear container
        $(this.container).clear();

        const bar = div().class('status-bar').mount(this.container);

        // Left Section: Menus & REPL
        const leftSection = div().class('status-left-section').mount(bar);
        this._renderMenus(leftSection);
        this._renderRepl(leftSection);

        // Center Section: Reasoner Controls
        const centerSection = div().class('status-controls-section').mount(bar);
        this._renderControls(centerSection);

        // Right Section: Info & Widgets
        const rightSection = div().class('status-info-section').mount(bar);
        this._renderInfo(rightSection);
    }

    _renderMenus(parent) {
        const menus = div().class('status-menus').mount(parent);

        const createMenu = (label, items) => {
            const wrapper = div().class('status-menu-item').mount(menus);
            button(label).class('status-menu-btn').on('click', (e) => {
                e.stopPropagation();
                // Close others
                this.container.querySelectorAll('.status-menu-item.active').forEach(item => {
                    if (item !== wrapper.dom) item.classList.remove('active');
                });
                wrapper.dom.classList.toggle('active');
            }).mount(wrapper);

            const dropdown = div().class('status-menu-dropdown').mount(wrapper);
            items.forEach(item => {
                if (item === 'divider') {
                    div().class('menu-divider').mount(dropdown);
                } else {
                    button(item.label)
                        .data('action', item.action)
                        .class(item.class || '')
                        .on('click', () => {
                            if (this.onMenuAction) this.onMenuAction(item.action);
                            wrapper.removeClass('active');
                        })
                        .mount(dropdown);
                }
            });
        };

        createMenu('File', [
            { label: 'Save Graph (JSON)...', action: 'save' },
            { label: 'Load Graph (JSON)...', action: 'load' },
            { label: 'Import Graph (CSV)...', action: 'import-csv' },
            'divider',
            { label: 'Export PNG', action: 'export-png' },
            { label: 'Export SVG', action: 'export-svg' }
        ]);

        createMenu('Edit', [
            { label: 'Add Node', action: 'add-concept' },
            { label: 'Link Nodes', action: 'add-link' },
            { label: 'Delete Selected', action: 'delete' },
            'divider',
            { label: 'Clear All', action: 'clear', class: 'danger' }
        ]);

        createMenu('View', [
            { label: 'Fit View', action: 'fit' },
            { label: 'Auto Layout', action: 'layout' },
            'divider',
            { label: 'Toggle Focus Mode', action: 'focus-mode' },
            { label: 'Toggle Fullscreen', action: 'fullscreen' }
        ]);

        createMenu('Help', [
            { label: 'Keyboard Shortcuts', action: 'shortcuts' }
        ]);

        // Close menus on outside click
        document.addEventListener('click', () => {
            this.container.querySelectorAll('.status-menu-item.active').forEach(item => {
                item.classList.remove('active');
            });
        });
    }

    _renderRepl(parent) {
        const wrapper = div().class('status-repl-wrapper').mount(parent);
        span().class('repl-prompt').text('>').mount(wrapper);

        const textarea = $('textarea')
            .id('status-repl-input')
            .class('status-repl-input')
            .attr({ rows: 1, placeholder: 'Command or chat...', autocomplete: 'off' })
            .mount(wrapper);

        // Bind events
        textarea.on('focus', () => {
            this.state.expanded = true;
            this.container.querySelector('.status-bar').classList.add('status-bar--expanded');
            textarea.dom.rows = 3;
        });

        textarea.on('blur', () => {
            setTimeout(() => {
                if (document.activeElement !== textarea.dom) {
                    this.state.expanded = false;
                    this.container.querySelector('.status-bar').classList.remove('status-bar--expanded');
                    textarea.dom.rows = 1;
                }
            }, 200);
        });

        textarea.on('keydown', (e) => {
            if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                const command = textarea.val().trim();
                if (command) {
                    this.onReplSubmit?.(command);
                    textarea.val('');
                }
            }
        });
    }

    _renderControls(parent) {
        this.btnRun = button('▶').id('status-btn-run').class('status-btn').attr('title', 'Run Reasoner')
            .on('click', () => {
                this.btnRun.addClass('active-pulse');
                this.onReasonerControl?.('run');
            }).mount(parent);

        this.btnPause = button('⏸').id('status-btn-pause').class('status-btn', 'hidden').attr('title', 'Pause Reasoner')
            .on('click', () => {
                this.btnRun.removeClass('active-pulse');
                this.onReasonerControl?.('pause');
            }).mount(parent);

        button('⏭').id('status-btn-step').class('status-btn').attr('title', 'Step Reasoner')
            .on('click', () => this.onReasonerControl?.('step')).mount(parent);

        const throttle = div().class('status-throttle').mount(parent);
        const slider = input('range', { min: 0, max: 1000, value: 100, step: 50, id: 'status-throttle-slider' }).mount(throttle);
        const valueDisplay = span().id('status-throttle-value').text('100ms').mount(throttle);

        slider.on('input', (e) => {
            const val = e.target.value;
            valueDisplay.text(`${val}ms`);
            this.onReasonerControl?.('throttle', parseInt(val));
        });
    }

    _renderInfo(parent) {
        const toolbar = div().class('status-toolbar-items').mount(parent);

        // Search
        const searchWrapper = div().style({ display: 'flex', alignItems: 'center', position: 'relative' }).mount(toolbar);
        input('text', { id: 'search-input', placeholder: 'Search...', class: 'control-input-small' }).mount(searchWrapper);
        button('✕', { id: 'btn-clear-search', class: 'status-btn-small' })
            .style({ position: 'absolute', right: '2px', fontSize: '0.8em', display: 'none' })
            .mount(searchWrapper);

        // Demo Select
        const select = $('select').id('demo-select').class('control-select-small').mount(toolbar);
        $('option').attr({ value: '', disabled: true, selected: true }).text('Load Demo...').mount(select);

        // Clear Workspace
        button('🗑️', { id: 'btn-clear', class: 'status-btn-small warning', title: 'Clear Workspace' }).mount(toolbar);

        div().class('status-divider').mount(parent);

        // Metrics
        this.elCycles = div().class('status-metric').id('status-cycles').text('📊 Cycles: 0').mount(parent);
        this.elNodes = div().class('status-metric').id('status-nodes').text('🧠 Nodes: 0/50').mount(parent);
        this.elTps = div().class('status-metric').id('status-tps').text('⚡ TPS: 0').mount(parent);

        div().class('status-divider').mount(parent);

        // Capabilities
        const caps = div().class('capability-lights').mount(parent);
        this.elCapReasoner = div().id('cap-reasoner').class('cap-light', 'status-offline').attr('title', 'NAL Reasoner: Offline').mount(caps);
        this.elCapLlm = div().id('cap-llm').class('cap-light', 'status-offline').attr('title', 'LLM Reasoning: Offline').mount(caps);

        div().class('status-divider').mount(parent);

        // Widget Toggles
        const toggleBtn = (id, icon, title, active = false) => {
            button(icon).id(id).class('widget-toggle-btn').class(active ? 'active' : '').attr('title', title)
                .on('click', (e) => {
                    // Logic to toggle widget via callback
                    // Need to map id to widgetId
                    const mapping = {
                        'toggle-layers': 'layers',
                        'toggle-metrics': 'metrics',
                        'toggle-logs': 'log',
                        'toggle-inspector': 'inspector',
                        'toggle-tasks': 'tasks'
                    };
                    const widgetId = mapping[id];
                    if (widgetId && this.onWidgetToggle) {
                        const isVisible = this.onWidgetToggle(widgetId);
                        $(e.target).toggleClass('active', isVisible);
                    }
                }).mount(parent);
        };

        toggleBtn('toggle-layers', '📐', 'Toggle Layers (1)', true);
        toggleBtn('toggle-metrics', '📊', 'Toggle Metrics (2)', true);
        toggleBtn('toggle-logs', '📝', 'Toggle Logs (3)', true);
        toggleBtn('toggle-inspector', '🔍', 'Toggle Inspector (4)', false);
        toggleBtn('toggle-tasks', '✅', 'Toggle Tasks (5)', true);

        div().class('status-metric', 'status-interactive').id('status-config').attr('title', 'Config').text('⚙️')
            .on('click', () => this.onConfig?.()).mount(parent);
    }

    updateMode(mode) {
        this.state.mode = mode;
    }

    updateStatus(status) {
        this.state.status = status;
    }

    updateStats(stats = {}) {
        this.state.stats = { ...this.state.stats, ...stats };

        if (this.elCycles) this.elCycles.text(`📊 Cycles: ${stats.cycles || 0}`);

        const activeNodes = stats.activeNodes !== undefined ? stats.activeNodes : (stats.nodes || 0);
        const maxNodes = stats.maxNodes || 50;
        if (this.elNodes) this.elNodes.text(`🧠 Nodes: ${activeNodes}/${maxNodes}`);

        if (this.elTps) this.elTps.text(`⚡ TPS: ${stats.tps || 0}`);
    }

    setReasonerRunning(isRunning) {
        if (this.btnRun) {
            if (isRunning) this.btnRun.addClass('hidden');
            else this.btnRun.removeClass('hidden');
        }
        if (this.btnPause) {
            if (isRunning) this.btnPause.removeClass('hidden');
            else this.btnPause.addClass('hidden');
        }
    }

    setCapability(id, status, tooltip) {
        const el = id === 'reasoner' ? this.elCapReasoner : (id === 'llm' ? this.elCapLlm : null);
        if (el) {
            el.removeClass('status-offline', 'status-online', 'status-warning', 'status-error', 'status-loading');
            el.addClass(`status-${status}`);
            if (tooltip) el.attr('title', tooltip);
        }
    }

    destroy() {
        super.destroy();
        this._disposables.forEach(d => d());
        this._disposables = [];
    }
}
