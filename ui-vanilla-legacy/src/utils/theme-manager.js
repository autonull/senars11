import AppConfig from '../config/app-config.js';
import Logger from './logger.js';

/**
 * ThemeManager - Handles dynamic theme switching and styling for the UI
 */
class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.themes = new Map([
            ['light', this._createLightTheme()],
            ['dark', this._createDarkTheme()],
            ['high-contrast', this._createHighContrastTheme()]
        ]);
        this.listeners = [];
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
    }

    _createLightTheme() {
        return {
            name: 'light',
            variables: {
                '--bg-primary': '#ffffff',
                '--bg-secondary': '#f5f5f5',
                '--text-primary': '#333333',
                '--text-secondary': '#666666',
                '--border-color': '#ddd',
                '--accent-color': '#007bff',
                '--success-color': '#28a745',
                '--warning-color': '#ffc107',
                '--error-color': '#dc3545',
                '--graph-bg': '#ffffff'
            }
        };
    }

    _createDarkTheme() {
        return {
            name: 'dark',
            variables: {
                '--bg-primary': '#1a1a1a',
                '--bg-secondary': '#2d2d2d',
                '--text-primary': '#ffffff',
                '--text-secondary': '#cccccc',
                '--border-color': '#444444',
                '--accent-color': '#007bff',
                '--success-color': '#28a745',
                '--warning-color': '#ffc107',
                '--error-color': '#dc3545',
                '--graph-bg': '#1a1a1a'
            }
        };
    }

    _createHighContrastTheme() {
        return {
            name: 'high-contrast',
            variables: {
                '--bg-primary': '#000000',
                '--bg-secondary': '#000000',
                '--text-primary': '#ffffff',
                '--text-secondary': '#ffffff',
                '--border-color': '#ffffff',
                '--accent-color': '#ffff00',
                '--success-color': '#00ff00',
                '--warning-color': '#ffff00',
                '--error-color': '#ff4444',
                '--graph-bg': '#000000'
            }
        };
    }

    setTheme(themeName) {
        if (!this.themes.has(themeName)) {
            Logger.warn(`Theme ${themeName} not found, using default`);
            themeName = 'light';
        }

        this.currentTheme = themeName;
        this.applyTheme(themeName);
        this._notifyListeners(themeName);
    }

    getTheme() {
        return this.themes.get(this.currentTheme);
    }

    applyTheme(themeName) {
        const theme = this.themes.get(themeName);
        if (!theme) return;

        const root = document.documentElement;
        
        for (const [property, value] of Object.entries(theme.variables)) {
            root.style.setProperty(property, value);
        }

        // Update graph background if it exists
        this._updateGraphBackground(theme.variables['--graph-bg']);
    }

    getAvailableThemes() {
        return Array.from(this.themes.keys());
    }

    getCurrentTheme() {
        return this.currentTheme;
    }

    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            const index = this.listeners.indexOf(callback);
            if (index > -1) this.listeners.splice(index, 1);
        };
    }

    _notifyListeners(themeName) {
        for (const listener of this.listeners) {
            try {
                listener(themeName);
            } catch (error) {
                Logger.error('Error in theme change listener', { error: error.message });
            }
        }
    }

    _updateGraphBackground(backgroundColor) {
        // If cytoscape is available, update the background
        if (window.cy) {
            window.cy.style().selector('core').style({
                'background-color': backgroundColor
            }).update();
        }
    }

    // Add custom theme dynamically
    addTheme(name, themeDefinition) {
        this.themes.set(name, {
            name,
            variables: {
                ...this._createLightTheme().variables,
                ...themeDefinition
            }
        });
    }

    // Export current theme as CSS variables
    exportTheme() {
        const theme = this.getTheme();
        return Object.entries(theme.variables)
            .map(([prop, value]) => `  ${prop}: ${value};`)
            .join('\n');
    }
}

// Singleton instance
const themeManager = new ThemeManager();

export { ThemeManager, themeManager };