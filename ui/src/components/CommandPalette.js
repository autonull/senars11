export class CommandPalette {
    constructor() {
        this.commands = [];
        this.isOpen = false;
        this.selectedIndex = 0;
        this.filteredCommands = [];
        this.element = null;
        this.input = null;
        this.resultsContainer = null;

        this._createUI();
        this._bindEvents();
    }

    _createUI() {
        // Overlay
        const overlay = document.createElement('div');
        overlay.id = 'command-palette-overlay';
        overlay.className = 'palette-overlay hidden';

        // Palette Container
        const container = document.createElement('div');
        container.className = 'palette-container';

        // Input Wrapper
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'palette-input-wrapper';

        // Icon
        const icon = document.createElement('span');
        icon.className = 'palette-icon';
        icon.innerHTML = '>';

        // Input
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'palette-input';
        this.input.placeholder = 'Type a command...';
        this.input.setAttribute('autocomplete', 'off');

        inputWrapper.appendChild(icon);
        inputWrapper.appendChild(this.input);

        // Results List
        this.resultsContainer = document.createElement('div');
        this.resultsContainer.className = 'palette-results';

        container.appendChild(inputWrapper);
        container.appendChild(this.resultsContainer);
        overlay.appendChild(container);

        document.body.appendChild(overlay);
        this.element = overlay;
    }

    _bindEvents() {
        // Global shortcut (handled by App usually, but we can add listener here too)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.isOpen) {
                this.hide();
            }
        });

        // Click outside to close
        this.element.addEventListener('click', (e) => {
            if (e.target === this.element) {
                this.hide();
            }
        });

        // Input handling
        this.input.addEventListener('input', () => {
            this._filterCommands();
            this.selectedIndex = 0;
            this._renderResults();
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
                this._renderResults();
                this._scrollToSelected();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
                this._renderResults();
                this._scrollToSelected();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this._executeSelected();
            }
        });
    }

    registerCommand(id, description, shortcut, callback) {
        this.commands.push({
            id,
            description,
            shortcut,
            callback
        });
    }

    show() {
        this.isOpen = true;
        this.element.classList.remove('hidden');
        this.input.value = '';
        this.input.focus();
        this._filterCommands();
        this._renderResults();
    }

    hide() {
        this.isOpen = false;
        this.element.classList.add('hidden');
    }

    toggle() {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    _filterCommands() {
        const query = this.input.value.toLowerCase();
        if (!query) {
            this.filteredCommands = this.commands;
        } else {
            this.filteredCommands = this.commands.filter(cmd =>
                cmd.id.toLowerCase().includes(query) ||
                cmd.description.toLowerCase().includes(query)
            );
        }
    }

    _renderResults() {
        this.resultsContainer.innerHTML = '';

        if (this.filteredCommands.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'palette-empty';
            empty.textContent = 'No commands found';
            this.resultsContainer.appendChild(empty);
            return;
        }

        this.filteredCommands.forEach((cmd, index) => {
            const item = document.createElement('div');
            item.className = `palette-item ${index === this.selectedIndex ? 'selected' : ''}`;
            item.onclick = () => {
                this.selectedIndex = index;
                this._executeSelected();
            };

            const left = document.createElement('div');
            left.className = 'palette-item-left';

            const label = document.createElement('span');
            label.className = 'palette-item-label';
            label.textContent = cmd.description; // Main text

            const sub = document.createElement('span');
            sub.className = 'palette-item-sub';
            sub.textContent = cmd.id; // Subtitle (technical id)

            left.appendChild(label);
            left.appendChild(sub);

            const right = document.createElement('div');
            right.className = 'palette-item-shortcut';
            if (cmd.shortcut) {
                // Format shortcut (e.g., "Ctrl+K" -> "⌃K" visually)
                right.textContent = cmd.shortcut;
            }

            item.appendChild(left);
            item.appendChild(right);
            this.resultsContainer.appendChild(item);
        });
    }

    _scrollToSelected() {
        const selected = this.resultsContainer.children[this.selectedIndex];
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    _executeSelected() {
        const cmd = this.filteredCommands[this.selectedIndex];
        if (cmd) {
            this.hide();
            try {
                cmd.callback();
            } catch (e) {
                console.error(`Command execution failed: ${cmd.id}`, e);
            }
        }
    }
}
