import {UI_CONSTANTS} from '../../../src/util/UIConstants.js';
import {LogViewer} from '../components/LogViewer.js';

/**
 * Logger module to handle all log message formatting and display
 */
export class Logger {
    constructor(uiElements = null) {
        this.uiElements = uiElements;
        this.logViewer = null;
        if (uiElements?.logsContainer) {
            this.logViewer = new LogViewer(uiElements.logsContainer);
        }
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

    /**
     * Set UI elements reference for DOM operations
     */
    setUIElements(uiElements) {
        this.uiElements = uiElements;
        if (uiElements?.logsContainer) {
            this.logViewer = new LogViewer(uiElements.logsContainer);
        }
    }

    /**
     * Add a log entry to the container
     */
    addLogEntry(content, type = 'info', icon = null) {
        if (this.logViewer) {
            return this.logViewer.addLog(content, type, icon);
        }

        // Fallback for when LogViewer is not initialized (e.g. tests or missing container)
        const effectiveIcon = icon ?? this.icons[type] ?? this.icons[UI_CONSTANTS.LOG_TYPES.INFO];
        const timestamp = new Date().toLocaleTimeString();

        console.log(`[${timestamp}] ${effectiveIcon} ${content}`);
        return null;
    }

    /**
     * Log a message using the addLogEntry method
     */
    log(content, type = 'info', icon = null) {
        this.addLogEntry(content, type, icon);
    }

    /**
     * Show a notification message
     */
    showNotification(message, type = 'info') {
        const container = this.uiElements?.notificationContainer || document.getElementById('notification-container');
        if (!container) {
            // If no container, just log to console
            console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](message);
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                container.removeChild(notification);
            }
        }, 5000);
    }

    /**
     * Clear all log entries
     */
    clearLogs() {
        if (this.logViewer) {
            this.logViewer.clear();
            this.log('Cleared logs', 'info', '🧹');
        } else if (this.uiElements?.logsContainer) {
            // Fallback
            try {
                this.uiElements.logsContainer.innerHTML = '';
            } catch (e) {
                console.error('[Logger] Error clearing logs:', e);
            }
            this.log('Cleared logs', 'info', '🧹');
        } else {
            console.error('[Logger] Cannot clear logs: logsContainer not found');
        }
    }
}