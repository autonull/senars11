import { FluentUI, div, span, input } from '../utils/FluentUI.js';

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
        const overlay = div()
            .id('command-palette-overlay')
            .class('palette-overlay', 'hidden')
            .mount(document.body);

        // Palette Container
        const container = div()
            .class('palette-container')
            .mount(overlay);

        // Input Wrapper
        const inputWrapper = div()
            .class('palette-input-wrapper')
            .mount(container);

        // Icon
        span()
            .class('palette-icon')
            .html('>')
            .mount(inputWrapper);

        // Input
        this.input = input('text', { placeholder: 'Type a command...', autocomplete: 'off' })
            .class('palette-input')
            .mount(inputWrapper);

        // Results List
        this.resultsContainerEl = div()
            .class('palette-results')
            .mount(container)
            .dom;

        this.element = overlay.dom;
        this.input = this.input.dom; // Keep reference to raw element for events
    }

    _bindEvents() {
        // Global shortcut
        document.addEventListener('keydown', (e) => {
            if (((e.ctrlKey || e.metaKey) && e.key === 'k') || e.key === 'F1') {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.isOpen) {
                this.hide();
            }
        });

        // Click outside
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

    registerCommand(id, description, shortcut, callback, category = 'General') {
        this.commands.push({
            id,
            description,
            shortcut,
            callback,
            category
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
            this.filteredCommands = [...this.commands];
        } else {
            this.filteredCommands = this.commands.filter(cmd =>
                cmd.id.toLowerCase().includes(query) ||
                cmd.description.toLowerCase().includes(query) ||
                cmd.category.toLowerCase().includes(query)
            );
        }

        // Sort by Category then Description
        this.filteredCommands.sort((a, b) => {
             if (a.category !== b.category) {
                 return a.category.localeCompare(b.category);
             }
             return a.description.localeCompare(b.description);
        });
    }

    _renderResults() {
        this.resultsContainerEl.innerHTML = '';

        if (this.filteredCommands.length === 0) {
            div()
                .class('palette-empty')
                .text('No commands found')
                .mount(this.resultsContainerEl);
            return;
        }

        let lastCategory = null;

        this.filteredCommands.forEach((cmd, index) => {
            if (cmd.category !== lastCategory) {
                div()
                    .class('palette-category-header')
                    .style({
                        padding: '4px 8px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        color: '#888',
                        textTransform: 'uppercase',
                        background: 'rgba(255,255,255,0.05)',
                        marginTop: '4px',
                        borderBottom: '1px solid #333'
                    })
                    .text(cmd.category)
                    .mount(this.resultsContainerEl);
                lastCategory = cmd.category;
            }

            const item = div()
                .class('palette-item')
                .class(index === this.selectedIndex ? 'selected' : '')
                .on('click', () => {
                    this.selectedIndex = index;
                    this._executeSelected();
                })
                .mount(this.resultsContainerEl);

            const left = div()
                .class('palette-item-left')
                .mount(item);

            span()
                .class('palette-item-label')
                .text(cmd.description)
                .mount(left);

            span()
                .class('palette-item-sub')
                .text(cmd.id)
                .mount(left);

            const right = div()
                .class('palette-item-shortcut')
                .mount(item);

            if (cmd.shortcut) {
                right.text(cmd.shortcut);
            }
        });
    }

    _scrollToSelected() {
        const selected = this.resultsContainerEl.querySelector('.palette-item.selected');
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
