import { UILoggerAdapter } from './UILoggerAdapter.js';
import { Logger as CoreLogger } from '@senars/core';

export class Logger {
    #adapter;

    constructor(uiElements = null) {
        this.#adapter = new UILoggerAdapter({ uiElements });
        CoreLogger.addAdapter(this.#adapter);
    }

    get adapter() { return this.#adapter; }

    setUIElements(uiElements) { this.#adapter.uiElements = uiElements; }
    setToastManager(toastManager) { this.#adapter.toastManager = toastManager; }
    setLogViewer(logViewer) { this.#adapter.logViewer = logViewer; }

    addLogEntry(content, type = 'info', icon = null) { return this.#adapter.addLogEntry(content, type, icon); }
    log(content, type = 'info', icon = null) { this.#adapter.addLogEntry(content, type, icon); }
    logMarkdown(content) { this.#adapter.logMarkdown(content); }
    logWidget(type, data) { this.#adapter.logWidget(type, data); }
    showNotification(message, type = 'info') { this.#adapter.showNotification(message, type); }
    clearLogs() { this.#adapter.clearLogs(); }
}
