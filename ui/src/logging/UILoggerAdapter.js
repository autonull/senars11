import { Logger as CoreLogger, ConsoleLoggerAdapter } from '@senars/core/src/util/Logger.js';
import { UI_CONSTANTS } from '@senars/core';

const DEFAULT_ICONS = {
    success: UI_CONSTANTS.LOG_ICONS.SUCCESS,
    error: UI_CONSTANTS.LOG_ICONS.ERROR,
    warning: UI_CONSTANTS.LOG_ICONS.WARNING,
    info: UI_CONSTANTS.LOG_ICONS.INFO,
    debug: UI_CONSTANTS.LOG_ICONS.DEBUG,
    input: UI_CONSTANTS.LOG_ICONS.INPUT,
    task: UI_CONSTANTS.LOG_ICONS.TASK,
    concept: UI_CONSTANTS.LOG_ICONS.CONCEPT,
    question: UI_CONSTANTS.LOG_ICONS.QUESTION,
    reasoning: UI_CONSTANTS.LOG_ICONS.REASONING,
    connection: UI_CONSTANTS.LOG_ICONS.CONNECTION,
    snapshot: UI_CONSTANTS.LOG_ICONS.SNAPSHOT,
    control: UI_CONSTANTS.LOG_ICONS.CONTROL,
    notification: UI_CONSTANTS.LOG_ICONS.NOTIFICATION,
    command: UI_CONSTANTS.LOG_ICONS.COMMAND,
    demo: UI_CONSTANTS.LOG_ICONS.DEMO,
    refresh: UI_CONSTANTS.LOG_ICONS.REFRESH,
    clear: UI_CONSTANTS.LOG_ICONS.CLEAR,
    eventBatch: UI_CONSTANTS.LOG_ICONS.EVENT_BATCH
};

const LEVEL_MAP = { ERROR: 'error', WARN: 'warning', INFO: 'info', DEBUG: 'debug' };

export class UILoggerAdapter {
    constructor({ logViewer = null, toastManager = null, uiElements = null, icons = null } = {}) {
        this.logViewer = logViewer;
        this.toastManager = toastManager;
        this.uiElements = uiElements;
        this.icons = { ...DEFAULT_ICONS, ...icons };
    }

    log(level, message, data) {
        const type = LEVEL_MAP[level.toUpperCase()] ?? 'info';
        this.addLogEntry(message, type, data);
    }

    addLogEntry(content, type = 'info', data = null) {
        if (this.logViewer?.addLog) return this.logViewer.addLog(content, type, this.icons[type]);
        this._logToConsole(content, type);
        return null;
    }

    logMarkdown(content) { this.logViewer?.logMarkdown?.(content); }
    logWidget(type, data) { this.logViewer?.logWidget?.(type, data); }

    showNotification(message, type = 'info') {
        if (this.toastManager) {
            this.toastManager.show(message, type);
        } else {
            const container = this.uiElements?.notificationContainer ?? document.getElementById('notification-container');
            if (container) {
                const el = document.createElement('div');
                el.className = `notification notification-${type}`;
                el.textContent = message;
                container.appendChild(el);
                setTimeout(() => el.parentNode?.removeChild(el), 5000);
            }
        }
    }

    clearLogs() {
        if (this.logViewer?.clear) this.logViewer.clear();
        else if (this.uiElements?.logsContainer) this.uiElements.logsContainer.innerHTML = '';
    }

    _logToConsole(content, type) {
        const icon = this.icons[type] ?? this.icons.info;
        const msg = `[${new Date().toLocaleTimeString()}] ${icon} ${content}`;
        type === 'error' ? console.error(msg) : type === 'warning' ? console.warn(msg) : console.log(msg);
    }
}

// Re-export the core Logger singleton for convenience
export { Logger as CoreLogger } from '@senars/core/src/util/Logger.js';
