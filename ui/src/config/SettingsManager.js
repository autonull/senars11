import { STORAGE_KEYS, MODES } from './constants.js';

export class SettingsManager {
    constructor() {
        this.settings = {
            mode: MODES.LOCAL,
            serverUrl: 'localhost:3000'
        };
        this.load();
    }

    load() {
        const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.settings = { ...this.settings, ...parsed };
            } catch (e) {
                console.error('Failed to parse settings', e);
            }
        }
    }

    save() {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.save();
    }

    getMode() {
        return this.settings.mode;
    }

    setMode(mode) {
        this.settings.mode = mode;
        this.save();
    }

    getServerUrl() {
        return this.settings.serverUrl;
    }

    setServerUrl(url) {
        this.settings.serverUrl = url;
        this.save();
    }
}
