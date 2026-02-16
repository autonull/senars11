/**
 * GuidanceOverlay provides visual cues (highlighting, tooltips) to guide the user
 */
export class GuidanceOverlay {
    constructor() {
        this.overlay = null;
        this.tooltip = null;
        this._ensureElements();
        window.addEventListener('resize', () => this.clear());
    }

    _ensureElements() {
        if (!document.getElementById('senars-guidance-overlay')) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'senars-guidance-overlay';
            this.overlay.style.cssText = `
                position: fixed;
                border: 2px solid var(--accent-primary, #00ff9d);
                box-shadow: 0 0 10px var(--accent-primary, #00ff9d), inset 0 0 5px var(--accent-primary, #00ff9d);
                background: rgba(0, 255, 157, 0.05);
                pointer-events: none;
                z-index: 10000;
                transition: all 0.3s ease;
                border-radius: 4px;
                opacity: 0;
            `;
            document.body.appendChild(this.overlay);

            this.tooltip = document.createElement('div');
            this.tooltip.id = 'senars-guidance-tooltip';
            this.tooltip.style.cssText = `
                position: fixed;
                background: var(--bg-panel, #1e1e1e);
                border: 1px solid var(--accent-primary, #00ff9d);
                color: var(--text-main, #eee);
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 10001;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.3s ease;
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                max-width: 300px;
            `;
            document.body.appendChild(this.tooltip);
        } else {
            this.overlay = document.getElementById('senars-guidance-overlay');
            this.tooltip = document.getElementById('senars-guidance-tooltip');
        }
    }

    /**
     * Highlight an element matching the selector
     * @param {string} selector - CSS selector
     * @param {string} message - Optional message to display
     * @param {number} duration - Duration in ms (default: 3000, 0 = infinite)
     */
    highlight(selector, message = null, duration = 3000) {
        const element = document.querySelector(selector);
        if (!element) {
            console.warn(`GuidanceOverlay: Element not found: ${selector}`);
            return;
        }

        const rect = element.getBoundingClientRect();

        // Show overlay
        this.overlay.style.top = `${rect.top - 5}px`;
        this.overlay.style.left = `${rect.left - 5}px`;
        this.overlay.style.width = `${rect.width + 10}px`;
        this.overlay.style.height = `${rect.height + 10}px`;
        this.overlay.style.opacity = '1';

        // Show tooltip if message provided
        if (message) {
            this.tooltip.textContent = message;
            this.tooltip.style.opacity = '1';

            // Position tooltip above or below
            const tooltipTop = rect.top - 40;
            if (tooltipTop > 10) {
                this.tooltip.style.top = `${tooltipTop}px`;
            } else {
                this.tooltip.style.top = `${rect.bottom + 10}px`;
            }
            this.tooltip.style.left = `${rect.left}px`;
        }

        if (duration > 0) {
            setTimeout(() => this.clear(), duration);
        }
    }

    clear() {
        if (this.overlay) this.overlay.style.opacity = '0';
        if (this.tooltip) this.tooltip.style.opacity = '0';
    }
}
