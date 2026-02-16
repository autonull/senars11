import { EVENTS, STORAGE_KEYS } from '../config/constants.js';

/**
 * ThemeManager handles application theming
 */
export class ThemeManager {
    constructor() {
        this.currentTheme = this._loadTheme();
        this.applyTheme(this.currentTheme);
    }

    _loadTheme() {
        try {
            return localStorage.getItem(STORAGE_KEYS.THEME) || 'default';
        } catch (e) {
            return 'default';
        }
    }

    setTheme(themeName) {
        this.currentTheme = themeName;
        this.applyTheme(themeName);
        try {
            localStorage.setItem(STORAGE_KEYS.THEME, themeName);
        } catch (e) {
            console.error('Failed to save theme preference', e);
        }
    }

    applyTheme(themeName) {
        document.body.classList.remove('theme-light', 'theme-contrast');

        if (themeName === 'light') {
            document.body.classList.add('theme-light');
        } else if (themeName === 'contrast') {
            document.body.classList.add('theme-contrast');
        }

        // Dispatch event for components that need manual redraw (like Graphs)
        document.dispatchEvent(new CustomEvent(EVENTS.SETTINGS_UPDATED, { detail: { theme: themeName } }));
    }

    getTheme() {
        return this.currentTheme;
    }
}
