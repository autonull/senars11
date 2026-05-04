/**
 * @file ShortcutManager.js
 * @description Manages keyboard shortcuts for the application
 */

import { Modal } from '../components/ui/Modal.js';

export class ShortcutManager {
    constructor() {
        this.shortcuts = [];
        this.isEnabled = true;
        this._bindEvents();
    }

    /**
     * Register a new keyboard shortcut
     * @param {Object} options
     * @param {string} options.key - The key (e.g., 's', 'Enter', 'F1')
     * @param {boolean} [options.ctrl=false] - Require Ctrl key
     * @param {boolean} [options.shift=false] - Require Shift key
     * @param {boolean} [options.alt=false] - Require Alt key
     * @param {string} options.desc - Description for the help menu
     * @param {Function} options.handler - Callback function
     */
    register({ key, ctrl = false, shift = false, alt = false, desc, handler }) {
        this.shortcuts.push({
            key,
            ctrl,
            shift,
            alt,
            desc,
            handler
        });
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (!this.isEnabled) {return;}

            for (const shortcut of this.shortcuts) {
                if (e.key.toLowerCase() === shortcut.key.toLowerCase() &&
                    !!e.ctrlKey === shortcut.ctrl &&
                    !!e.shiftKey === shortcut.shift &&
                    !!e.altKey === shortcut.alt) {

                    if (typeof shortcut.handler === 'function') {
                        e.preventDefault();
                        shortcut.handler();
                        return;
                    }
                }
            }
        });
    }

    /**
     * Show the help modal with all registered shortcuts
     */
    showHelpModal() {
        const content = this.shortcuts.map(s => {
            const keys = [];
            if (s.ctrl) {keys.push('Ctrl');}
            if (s.shift) {keys.push('Shift');}
            if (s.alt) {keys.push('Alt');}
            keys.push(s.key.toUpperCase());

            const keyString = keys.join(' + ');

            return `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #333;">
                <span style="font-family: monospace; color: #00ff9d; font-weight: bold;">${keyString}</span>
                <span style="color: #ccc;">${s.desc}</span>
            </div>`;
        }).join('');

        new Modal({ title: '⌨️ Global Shortcuts', content, width: '450px' }).show();
    }

    enable() {
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }
}
