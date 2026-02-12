import { MESSAGE_CATEGORIES, VIEW_MODES } from './MessageFilter.js';
import { FluentUI } from '../utils/FluentUI.js';
import { FluentToolbar } from '../components/ui/FluentToolbar.js';

export class FilterToolbar {
    constructor(messageFilter, callbacks = {}) {
        this.messageFilter = messageFilter;
        this.onFilterChange = callbacks.onFilterChange || (() => {});
        this.onExport = callbacks.onExport || (() => {});
        this.onImport = callbacks.onImport || (() => {});
        this.onRunAll = callbacks.onRunAll || (() => {});
        this.onClearOutputs = callbacks.onClearOutputs || (() => {});
        this.onViewChange = callbacks.onViewChange || (() => {});
        this.currentView = 'list';
        this.element = null;
        this.buttons = new Map();
    }

    render() {
        this.element = FluentUI.create('div').class('filter-toolbar');

        // Search Input
        this.element.child(
            FluentUI.create('input')
                .attr({ type: 'text', placeholder: '🔍 Search messages...', value: this.messageFilter.searchTerm || '' })
                .class('filter-search-input')
                .on('input', (e) => {
                    this.messageFilter.setSearchTerm(e.target.value);
                    this.onFilterChange();
                })
        );

        // Category Buttons
        const catButtons = FluentUI.create('div').class('filter-btn-group');
        Object.entries(MESSAGE_CATEGORIES).forEach(([id, cat]) => {
            const btn = FluentUI.create('button')
                .class('filter-btn')
                .attr({ 'data-category': id })
                .on('click', () => {
                    const newMode = this.messageFilter.cycleCategoryMode(id);
                    this.updateButtonStyle(btn.dom, id, newMode);
                    this.onFilterChange();
                });

            this.updateButtonStyle(btn.dom, id, this.messageFilter.getCategoryMode(id));
            this.buttons.set(id, btn.dom);
            catButtons.child(btn);
        });
        this.element.child(catButtons);

        // View Switcher & Actions can be done via FluentToolbar for consistency
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

        const toolbar = new FluentToolbar(FluentUI.create('div').dom, actionsConfig); // Temp container
        toolbar.render(); // Renders into temp container

        // Append children of temp container to main element (FluentToolbar replaces innerHTML)
        Array.from(toolbar.container.children).forEach(c => this.element.child(c));

        return this.element.dom;
    }

    getViewBtnStyle(mode) {
        const isActive = mode === this.currentView;
        return {
            background: isActive ? '#333' : 'transparent',
            color: isActive ? '#fff' : '#888',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: '2px',
            fontSize: '14px'
        };
    }

    updateViewButtons(container) {
        // Manually update styles since FluentToolbar doesn't have reactive state binding yet
        Array.from(container.children).forEach(btn => {
            // Find the config item logic... simpler to just check index or attribute if we added one
            // We added customData via FluentToolbar? No, FluentToolbar doesn't attach generic data attributes from config easily yet
            // Let's rely on mapping icons or title
            const modes = { '☰': 'list', '⊞': 'grid', '🧱': 'icon', '🕸️': 'graph' };
            const mode = modes[btn.innerText];
            if (mode) {
                const isActive = mode === this.currentView;
                btn.style.background = isActive ? '#333' : 'transparent';
                btn.style.color = isActive ? '#fff' : '#888';
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
