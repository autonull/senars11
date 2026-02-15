import { UI_CONSTANTS } from '../utils/Constants.js';

/**
 * Logger module to handle all log message formatting and display
 */
export class Logger {
  constructor(uiElements = null) {
    this.uiElements = uiElements;
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
  }

  /**
   * Add a log entry to the container
   */
  addLogEntry(content, type = 'info', icon = null) {
    const effectiveIcon = icon ?? this.icons[type] ?? this.icons[UI_CONSTANTS.LOG_TYPES.INFO];
    const timestamp = new Date().toLocaleTimeString();

    // Create log entry elements with helper function
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry type-${type}`;

    // Create elements directly without intermediate object to reduce object creation
    const iconElement = this._createLogElement('span', 'log-entry-icon', effectiveIcon);
    const contentElement = this._createLogElement('div', 'log-entry-content', content);
    const timeElement = this._createLogElement('span', 'log-entry-time', timestamp, `time-${this.messageCounter}`);

    logEntry.appendChild(iconElement);
    logEntry.appendChild(contentElement);
    logEntry.appendChild(timeElement);

    // Add to container if available
    const container = this.uiElements?.logsContainer;
    if (container) {
      // Store the previous scroll position and max scroll height to detect if user was at bottom
      const previousScrollTop = container.scrollTop;
      const previousScrollHeight = container.scrollHeight;
      const isScrolledToBottom = Math.abs(previousScrollHeight - (previousScrollTop + container.clientHeight)) < 1;

      container.appendChild(logEntry);

      // Auto-scroll to bottom - only do this if user was already at the bottom to avoid jarring UX
      if (isScrolledToBottom) {
        // Use requestAnimationFrame to ensure DOM is updated before scrolling
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
          window.requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
          });
        } else {
          container.scrollTop = container.scrollHeight;
        }
      }
    }

    this.messageCounter++;
    return logEntry;
  }

  /**
   * Helper function to create log entry elements
   */
  _createLogElement(tag, className, textContent, id = null) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = textContent;
    if (id) element.id = id;
    return element;
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
    if (this.uiElements?.logsContainer) {
      this.uiElements.logsContainer.innerHTML = '';
      this.log('Cleared logs', 'info', '🧹');
    }
  }
}