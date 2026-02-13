import { MESSAGE_CATEGORIES, VIEW_MODES } from './MessageFilter.js';

export class FilterToolbar {
    constructor(messageFilter, callbacks = {}) {
        this.messageFilter = messageFilter;
        this.onFilterChange = callbacks.onFilterChange || (() => {});
        this.onExport = callbacks.onExport || (() => {});
        this.element = null;
        this.buttons = new Map();
    }

    render() {
        const toolbar = document.createElement('div');
        toolbar.className = 'filter-toolbar';
        toolbar.style.cssText = 'padding: 8px; background: #2d2d2d; border-bottom: 1px solid #333; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;';

        // Search Input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 Search messages...';
        searchInput.style.cssText = 'flex: 1; min-width: 150px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3c3c3c; padding: 4px 8px; border-radius: 3px; font-size: 0.9em;';
        searchInput.value = this.messageFilter.searchTerm || '';
        searchInput.oninput = (e) => {
            this.messageFilter.setSearchTerm(e.target.value);
            this.onFilterChange();
        };

        // Category Buttons Container
        const categoryButtons = document.createElement('div');
        categoryButtons.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';

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

        // Export Button
        const exportBtn = document.createElement('button');
        exportBtn.innerHTML = '💾 Export';
        exportBtn.title = 'Export filtered logs';
        exportBtn.style.cssText = 'padding: 4px 8px; background: #333; color: #ccc; border: 1px solid #444; cursor: pointer; border-radius: 3px; font-size: 0.85em; margin-left: 4px;';
        exportBtn.onclick = () => this.onExport();

        toolbar.appendChild(searchInput);
        toolbar.appendChild(categoryButtons);
        toolbar.appendChild(exportBtn);

        this.element = toolbar;
        return toolbar;
    }

    updateButtonStyle(btn, categoryId, mode) {
        const cat = MESSAGE_CATEGORIES[categoryId];
        const isHidden = mode === VIEW_MODES.HIDDEN;
        const isCompact = mode === VIEW_MODES.COMPACT;

        btn.innerHTML = `${cat.icon} ${cat.label} ${isCompact ? '🔹' : isHidden ? '👁️‍🗨️' : ''}`;

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

    // Call this if filters change externally
    refresh() {
        if (!this.element) return;
        this.buttons.forEach((btn, id) => {
            this.updateButtonStyle(btn, id, this.messageFilter.getCategoryMode(id));
        });
        // Update search input if needed?
    }
}
