export class GlobalContextMenu {
    constructor() {
        this.element = null;
        this.isVisible = false;
        this._init();
    }

    _init() {
        // Create single menu element attached to body
        this.element = document.createElement('div');
        this.element.className = 'global-context-menu';
        this.element.style.cssText = `
            position: fixed;
            background: #252526;
            border: 1px solid #454545;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            z-index: 10000;
            display: none;
            flex-direction: column;
            border-radius: 4px;
            padding: 4px 0;
            min-width: 150px;
        `;
        document.body.appendChild(this.element);

        // Global click to close
        document.addEventListener('click', (e) => {
            if (this.isVisible && !this.element.contains(e.target)) {
                this.hide();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    /**
     * Show context menu
     * @param {number} x - Client X coordinate
     * @param {number} y - Client Y coordinate
     * @param {Array} items - List of items: { label, icon, action, separator? }
     */
    show(x, y, items) {
        this.element.innerHTML = '';

        items.forEach(item => {
            if (item.separator) {
                const sep = document.createElement('div');
                sep.style.cssText = 'height: 1px; background: #454545; margin: 4px 0;';
                this.element.appendChild(sep);
                return;
            }

            const div = document.createElement('div');
            div.className = 'context-menu-item';
            div.style.cssText = `
                padding: 6px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                font-family: monospace;
                font-size: 12px;
                color: #ccc;
                transition: background 0.1s;
            `;
            div.onmouseenter = () => div.style.background = '#094771';
            div.onmouseleave = () => div.style.background = 'transparent';

            const icon = document.createElement('span');
            icon.textContent = item.icon || ' ';
            icon.style.width = '16px';
            icon.style.textAlign = 'center';

            const label = document.createElement('span');
            label.textContent = item.label;
            label.style.flex = 1;

            div.append(icon, label);

            div.onclick = (e) => {
                e.stopPropagation();
                this.hide();
                item.action();
            };

            this.element.appendChild(div);
        });

        // Position ensuring it stays on screen
        const rect = this.element.getBoundingClientRect(); // Need to display first?
        this.element.style.display = 'flex'; // Display to measure

        // Basic positioning
        let left = x;
        let top = y;

        // Adjust if overflow
        // We can do this better by measuring after display, but simple check is okay
        const width = 200; // estimated
        const height = items.length * 30; // estimated

        if (left + width > window.innerWidth) left = window.innerWidth - width - 10;
        if (top + height > window.innerHeight) top = window.innerHeight - height - 10;

        this.element.style.left = left + 'px';
        this.element.style.top = top + 'px';

        this.isVisible = true;
    }

    hide() {
        this.isVisible = false;
        this.element.style.display = 'none';
    }
}

// Singleton instance
export const contextMenu = new GlobalContextMenu();
