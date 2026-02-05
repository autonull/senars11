import {UI_CONSTANTS} from '@senars/core';

export class Logger {
    constructor(uiElements = null) {
        this.uiElements = uiElements;
        this.logViewer = null;
        this.messageCounter = 1;
        this.icons = {
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
    }

    setUIElements(uiElements) {
        this.uiElements = uiElements;
    }

    addLogEntry(content, type = 'info', icon = null) {
        if (this.logViewer?.addLog) {
            return this.logViewer.addLog(content, type, icon);
        }
        this._logToConsole(content, type, icon);
        return null;
    }

    log(content, type = 'info', icon = null) {
        this.addLogEntry(content, type, icon);
    }

    logMarkdown(content) {
        if (this.logViewer?.logMarkdown) {
            this.logViewer.logMarkdown(content);
        } else {
            console.log('[Markdown Log]', content);
        }
    }

    logWidget(type, data) {
        if (this.logViewer?.logWidget) {
            this.logViewer.logWidget(type, data);
        } else {
            console.log('[Widget Log]', type, data);
        }
    }

    showNotification(message, type = 'info') {
        const container = this.uiElements?.notificationContainer ?? document.getElementById('notification-container');
        if (!container) {
            this._logToConsole(message, type);
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => notification.parentNode?.removeChild(notification), 5000);
    }

    _logToConsole(content, type, icon = null) {
        const effectiveIcon = icon ?? this.icons[type] ?? this.icons[UI_CONSTANTS.LOG_TYPES.INFO];
        const timestamp = new Date().toLocaleTimeString();
        const msg = `[${timestamp}] ${effectiveIcon || ''} ${content}`;

        switch (type) {
            case 'error':
                console.error(msg);
                break;
            case 'warning':
                console.warn(msg);
                break;
            default:
                console.log(msg);
        }
    }


    clearLogs() {
        if (this.logViewer?.clear) {
            this.logViewer.clear();
        } else if (this.uiElements?.logsContainer) {
            try {
                this.uiElements.logsContainer.innerHTML = '';
            } catch (e) {
                console.error('[Logger] Error clearing logs:', e);
            }
        } else {
            console.error('[Logger] Cannot clear logs: logsContainer not found');
            return;
        }
        this.log('Cleared logs', 'info', '🧹');
    }
}
