import { MESSAGE_CATEGORIES, VIEW_MODES } from './MessageFilter.js';
import { FluentUI } from '../utils/FluentUI.js';
import { FluentToolbar } from '../components/ui/FluentToolbar.js';

export class FilterToolbar {
    constructor(messageFilter, callbacks = {}) {
        this.messageFilter = messageFilter;
        this.callbacks = callbacks;
        this.onFilterChange = callbacks.onFilterChange || (() => {});
        this.onExport = callbacks.onExport || (() => {});
        this.onImport = callbacks.onImport || (() => {});
        this.onRunAll = callbacks.onRunAll || (() => {});
        this.onClearOutputs = callbacks.onClearOutputs || (() => {});
        this.onViewChange = callbacks.onViewChange || (() => {});
        this.currentView = 'list';
        this.element = null;
        this.buttons = new Map();

        // Reactive bindings
        if (this.messageFilter.state) {
            this.messageFilter.state.watch('modeMap', () => {
                this.refresh();
                this.onFilterChange();
            });
            this.messageFilter.state.watch('searchTerm', () => {
                this.onFilterChange();
            });
        }
    }

    render() {
        this.element = FluentUI.create('div').class('filter-toolbar');

        // Search Input
        FluentUI.create('input')
            .attr({ type: 'text', placeholder: '🔍 Search messages...', value: this.messageFilter.searchTerm || '' })
            .class('filter-search-input')
            .on('input', (e) => {
                this.messageFilter.setSearchTerm(e.target.value);
            })
            .mount(this.element);

        // Category Buttons
        const catButtons = FluentUI.create('div')
            .class('filter-btn-group')
            .mount(this.element);

        Object.entries(MESSAGE_CATEGORIES).forEach(([id, cat]) => {
            const btn = FluentUI.create('button')
                .class('filter-btn')
                .attr({ 'data-category': id })
                .on('click', () => {
                    this.messageFilter.cycleCategoryMode(id);
                });

            this.updateButtonStyle(btn.dom, id, this.messageFilter.getCategoryMode(id));
            this.buttons.set(id, btn.dom);
            catButtons.child(btn);
        });

        // View Switcher & Actions via FluentToolbar
        const actionsConfig = [
            {
                type: 'group',
                class: 'filter-view-group',
                items: ['list', 'grid', 'icon', 'graph'].map(mode => ({
                    type: 'button',
                    label: { list: '☰', grid: '⊞', icon: '🧱', graph: '🕸️' }[mode],
                    title: `${mode.charAt(0).toUpperCase() + mode.slice(1)} View`,
                    style: this.getViewBtnStyle(mode),
                    onClick: (e) => {
                        this.currentView = mode;
                        this.onViewChange(mode);
                        this.updateViewButtons(e.target.parentElement);
                    },
                    class: 'view-btn', // marker class
                    customData: { mode }
                }))
            },
            {
                type: 'group',
                class: 'filter-action-group',
                items: [
                    { type: 'button', label: '🔽', title: 'Collapse All', onClick: () => {
                        this.messageFilter.getAllCategories().forEach(cat => this.messageFilter.setCategoryMode(cat.id, VIEW_MODES.COMPACT));
                        this.refresh();
                        this.onFilterChange();
                    }},
                    { type: 'button', label: '🔼', title: 'Expand All', onClick: () => {
                        this.messageFilter.getAllCategories().forEach(cat => this.messageFilter.setCategoryMode(cat.id, VIEW_MODES.FULL));
                        this.refresh();
                        this.onFilterChange();
                    }},
                    { type: 'button', label: '▶️▶️', title: 'Run All', class: 'primary', onClick: () => this.onRunAll() },
                    { type: 'button', label: '🧹', title: 'Clear Outputs', onClick: () => this.onClearOutputs() },
                    { type: 'button', icon: '↩️', title: 'Undo Delete', onClick: () => this.callbacks.onUndo?.() },
                    { type: 'button', label: '🔄', title: 'Restart Kernel / Reset', onClick: () => this.onReset?.() },
                    { type: 'custom', renderer: () => {
                        const input = FluentUI.create('input').attr({ type: 'file', accept: '.json' }).style({ display: 'none' })
                            .on('change', (e) => {
                                if (e.target.files.length > 0) {
                                    this.onImport(e.target.files[0]);
                                    e.target.value = '';
                                }
                            });
                        const btn = FluentUI.create('button').class('toolbar-btn').text('📂 Import').attr({ title: 'Import notebook' })
                            .on('click', () => input.dom.click());
                        return FluentUI.create('span').child(btn).child(input).dom;
                    }},
                    { type: 'button', label: '💾 Export', title: 'Export notebook', onClick: () => this.onExport() }
                ]
            }
        ];

        // Create a temp div for FluentToolbar to render into
        const toolbarContainer = FluentUI.create('div');
        new FluentToolbar(toolbarContainer.dom, actionsConfig).render();

        // Append children of temp container to main element
        Array.from(toolbarContainer.dom.children).forEach(c => this.element.dom.appendChild(c));

        return this.element.dom;
    }

    getViewBtnStyle(mode) {
        const isActive = mode === this.currentView;
        return {
            background: isActive ? 'var(--accent-primary-dim, #0e639c)' : 'transparent',
            color: isActive ? '#fff' : 'var(--text-muted, #888)',
            border: isActive ? '1px solid var(--accent-primary, #00d4ff)' : '1px solid transparent',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: '3px',
            fontSize: '14px',
            transition: 'all 0.2s'
        };
    }

    updateViewButtons(container) {
        Array.from(container.children).forEach(btn => {
            // Map icon to mode
            const text = btn.innerText;
            const mode = Object.entries({ '☰': 'list', '⊞': 'grid', '🧱': 'icon', '🕸️': 'graph' })
                .find(([icon]) => text.includes(icon))?.[1];

            if (mode) {
                const isActive = mode === this.currentView;
                Object.assign(btn.style, this.getViewBtnStyle(mode)); // Re-apply full style object
                if (isActive) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    }

    updateButtonStyle(btn, categoryId, mode) {
        const cat = MESSAGE_CATEGORIES[categoryId];
        const isHidden = mode === VIEW_MODES.HIDDEN;
        const isCompact = mode === VIEW_MODES.COMPACT;

        btn.innerHTML = `${cat.icon} ${cat.label} ${isCompact ? '🔹' : isHidden ? '👁️‍🗨️' : ''}`;

        Object.assign(btn.style, {
            padding: '4px 8px',
            background: !isHidden ? cat.color : '#333',
            color: !isHidden ? '#000' : '#888',
            border: `1px solid ${!isHidden ? cat.color : '#444'}`,
            opacity: isHidden ? '0.6' : '1',
            cursor: 'pointer',
            borderRadius: '3px',
            fontSize: '0.85em',
            fontWeight: !isHidden ? 'bold' : 'normal',
            transition: 'all 0.2s',
            textDecoration: isHidden ? 'line-through' : 'none'
        });
    }

    refresh() {
        if (!this.element) return;
        this.buttons.forEach((btn, id) => {
            this.updateButtonStyle(btn, id, this.messageFilter.getCategoryMode(id));
        });
    }
}
