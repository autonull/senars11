import { MESSAGE_CATEGORIES, VIEW_MODES } from './MessageFilter.js';

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
        const toolbar = document.createElement('div');
        toolbar.className = 'filter-toolbar';

        // Search Input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 Search messages...';
        searchInput.className = 'filter-search-input';
        searchInput.value = this.messageFilter.searchTerm || '';
        searchInput.oninput = (e) => {
            this.messageFilter.setSearchTerm(e.target.value);
            this.onFilterChange();
        };

        // Category Buttons Container
        const categoryButtons = document.createElement('div');
        categoryButtons.className = 'filter-btn-group';

        Object.entries(MESSAGE_CATEGORIES).forEach(([id, cat]) => {
            const btn = document.createElement('button');
            btn.dataset.category = id;
            btn.className = 'filter-btn';

            this.updateButtonStyle(btn, id, this.messageFilter.getCategoryMode(id));

            btn.onclick = () => {
                const newMode = this.messageFilter.cycleCategoryMode(id);
                this.updateButtonStyle(btn, id, newMode);
                this.onFilterChange();
            };

            this.buttons.set(id, btn);
            categoryButtons.appendChild(btn);
        });

        // View Switcher
        const viewGroup = document.createElement('div');
        viewGroup.className = 'filter-view-group';

        ['list', 'grid', 'icon', 'graph'].forEach(mode => {
            const btn = document.createElement('button');
            const icons = { list: '☰', grid: '⊞', icon: '🧱', graph: '🕸️' };
            btn.innerHTML = icons[mode];
            btn.title = `${mode.charAt(0).toUpperCase() + mode.slice(1)} View`;
            btn.onclick = () => {
                this.currentView = mode;
                this.onViewChange(mode);
                this.updateViewButtons(viewGroup);
            };
            btn.dataset.mode = mode;
            viewGroup.appendChild(btn);
        });
        this.updateViewButtons(viewGroup);

        // Action Buttons Group
        const actionGroup = document.createElement('div');
        actionGroup.className = 'filter-action-group';

        // Collapse All Button
        const collapseAllBtn = this._createBtn('🔽', 'Collapse All Results', () => {
             this.messageFilter.getAllCategories().forEach(cat => {
                 this.messageFilter.setCategoryMode(cat.id, VIEW_MODES.COMPACT);
             });
             this.refresh();
             this.onFilterChange();
        });

        // Expand All Button
        const expandAllBtn = this._createBtn('🔼', 'Expand All Results', () => {
             this.messageFilter.getAllCategories().forEach(cat => {
                 this.messageFilter.setCategoryMode(cat.id, VIEW_MODES.FULL);
             });
             this.refresh();
             this.onFilterChange();
        });

        // Run All Button
        const runAllBtn = this._createBtn('▶️▶️', 'Run All Cells', () => this.onRunAll(), 'primary');

        // Clear Outputs Button
        const clearBtn = this._createBtn('🧹', 'Clear Outputs', () => this.onClearOutputs());

        // Import Button
        const importBtn = this._createBtn('📂 Import', 'Import notebook', null);
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        fileInput.onchange = (e) => {
            if (e.target.files.length > 0) {
                this.onImport(e.target.files[0]);
                e.target.value = ''; // Reset
            }
        };
        importBtn.onclick = () => fileInput.click();

        // Export Button
        const exportBtn = this._createBtn('💾 Export', 'Export notebook', () => this.onExport());

        actionGroup.append(collapseAllBtn, expandAllBtn, runAllBtn, clearBtn, importBtn, exportBtn, fileInput);

        toolbar.appendChild(searchInput);
        toolbar.appendChild(categoryButtons);
        toolbar.appendChild(viewGroup);
        toolbar.appendChild(actionGroup);

        this.element = toolbar;
        return toolbar;
    }

    _createBtn(html, title, onClick, extraClass = '') {
        const btn = document.createElement('button');
        btn.innerHTML = html;
        btn.title = title;
        btn.className = `toolbar-btn ${extraClass}`;
        if (onClick) btn.onclick = onClick;
        return btn;
    }

    updateViewButtons(container) {
        Array.from(container.children).forEach(btn => {
            const isActive = btn.dataset.mode === this.currentView;
            btn.style.cssText = `
                background: ${isActive ? '#333' : 'transparent'};
                color: ${isActive ? '#fff' : '#888'};
                border: none;
                padding: 4px 8px;
                cursor: pointer;
                border-radius: 2px;
                font-size: 14px;
            `;
        });
    }

    updateButtonStyle(btn, categoryId, mode) {
        const cat = MESSAGE_CATEGORIES[categoryId];
        const isHidden = mode === VIEW_MODES.HIDDEN;
        const isCompact = mode === VIEW_MODES.COMPACT;

        btn.innerHTML = `${cat.icon} ${cat.label} ${isCompact ? '🔹' : isHidden ? '👁️‍🗨️' : ''}`;

        // Dynamic styles for category buttons usually remain inline due to dynamic colors
        btn.style.cssText = `
            padding: 4px 8px;
            background: ${!isHidden ? cat.color : '#333'};
            color: ${!isHidden ? '#000' : '#888'};
            border: 1px solid ${!isHidden ? cat.color : '#444'};
            opacity: ${isHidden ? '0.6' : '1'};
            cursor: pointer;
            border-radius: 3px;
            font-size: 0.85em;
            font-weight: ${!isHidden ? 'bold' : 'normal'};
            transition: all 0.2s;
            text-decoration: ${isHidden ? 'line-through' : 'none'};
        `;
    }

    refresh() {
        if (!this.element) return;
        this.buttons.forEach((btn, id) => {
            this.updateButtonStyle(btn, id, this.messageFilter.getCategoryMode(id));
        });
    }
}
