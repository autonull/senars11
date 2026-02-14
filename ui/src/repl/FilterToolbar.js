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

        // View Switcher
        const viewGroup = document.createElement('div');
        viewGroup.style.cssText = 'display: flex; gap: 2px; margin: 0 4px; background: #1e1e1e; padding: 2px; border-radius: 4px;';

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
        actionGroup.style.cssText = 'display: flex; gap: 4px; margin-left: 4px; border-left: 1px solid #444; padding-left: 4px;';

        // Run All Button
        const runAllBtn = document.createElement('button');
        runAllBtn.innerHTML = '▶️▶️';
        runAllBtn.title = 'Run All Cells';
        runAllBtn.style.cssText = 'padding: 4px 8px; background: #0e639c; color: #fff; border: 1px solid #444; cursor: pointer; border-radius: 3px; font-size: 0.85em;';
        runAllBtn.onclick = () => this.onRunAll();

        // Clear Outputs Button
        const clearBtn = document.createElement('button');
        clearBtn.innerHTML = '🧹';
        clearBtn.title = 'Clear Outputs';
        clearBtn.style.cssText = 'padding: 4px 8px; background: #333; color: #ccc; border: 1px solid #444; cursor: pointer; border-radius: 3px; font-size: 0.85em;';
        clearBtn.onclick = () => this.onClearOutputs();

        // Import Button
        const importBtn = document.createElement('button');
        importBtn.innerHTML = '📂 Import';
        importBtn.title = 'Import notebook';
        importBtn.style.cssText = 'padding: 4px 8px; background: #333; color: #ccc; border: 1px solid #444; cursor: pointer; border-radius: 3px; font-size: 0.85em;';

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
        const exportBtn = document.createElement('button');
        exportBtn.innerHTML = '💾 Export';
        exportBtn.title = 'Export notebook';
        exportBtn.style.cssText = 'padding: 4px 8px; background: #333; color: #ccc; border: 1px solid #444; cursor: pointer; border-radius: 3px; font-size: 0.85em;';
        exportBtn.onclick = () => this.onExport();

        actionGroup.append(runAllBtn, clearBtn, importBtn, exportBtn, fileInput);

        toolbar.appendChild(searchInput);
        toolbar.appendChild(categoryButtons);
        toolbar.appendChild(viewGroup);
        toolbar.appendChild(actionGroup);

        this.element = toolbar;
        return toolbar;
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
