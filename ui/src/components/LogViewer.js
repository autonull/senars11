import {Component} from './Component.js';
import {UI_CONSTANTS} from '@senars/core';
import {NarseseHighlighter} from '../utils/NarseseHighlighter.js';
import {WidgetFactory} from './widgets/WidgetFactory.js';

/**
 * LogViewer component for displaying log entries with icons and formatting
 */
export class LogViewer extends Component {
    constructor(container) {
        super(container);
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

    render() {
        if (!this.container) return;
        this.container.classList.add('logs-container');
        // Clear existing content? Maybe not if we want to preserve logs.
        // But if render is called, it might mean initialization.
    }

    addLog(content, type = 'info', icon = null) {
        if (!this.container) return;

        const effectiveIcon = icon ?? this.icons[type] ?? this.icons[UI_CONSTANTS.LOG_TYPES.INFO];
        const timestamp = new Date().toLocaleTimeString();

        // Create log entry elements
        const logEntry = this._createLogElement('div', `log-entry type-${type}`);
        const iconElement = this._createLogElement('span', 'log-entry-icon', effectiveIcon);

        // Handle content display (JSON vs String)
        let contentElement;
        if (typeof content === 'object' && content !== null) {
            contentElement = document.createElement('div');
            contentElement.className = 'log-entry-content';

            // Check for Dynamic Widget Request
            if (content.type === 'widget' && content.widgetType) {
                const widgetContainer = document.createElement('div');
                widgetContainer.className = 'log-widget-container';
                widgetContainer.style.cssText = 'margin: 5px 0; width: 100%;';

                const widget = WidgetFactory.createWidget(content.widgetType, widgetContainer, content.config || content.data);
                if (widget) {
                    widget.render();
                    contentElement.appendChild(widgetContainer);
                } else {
                    contentElement.textContent = `[Widget Error: Unknown type ${content.widgetType}]`;
                    contentElement.style.color = 'red';
                }
            } else {
                // Check if object is large (e.g., > 10 keys or deep nesting - heuristic)
                const jsonString = JSON.stringify(content, null, 2);
                if (jsonString.length > 200) {
                    const details = document.createElement('details');
                    const summary = document.createElement('summary');
                    summary.textContent = `Object (${Object.keys(content).length} keys)`;
                    summary.style.cursor = 'pointer';
                    summary.style.color = '#aaa';

                    const pre = document.createElement('pre');
                    pre.textContent = jsonString;
                    pre.style.marginTop = '5px';
                    pre.style.fontSize = '0.9em';

                    details.appendChild(summary);
                    details.appendChild(pre);
                    contentElement.appendChild(details);
                } else {
                    const pre = document.createElement('pre');
                    pre.textContent = jsonString;
                    pre.style.margin = '0';
                    contentElement.appendChild(pre);
                }
            }
        } else {
            // String content with Syntax Highlighting
            contentElement = document.createElement('div');
            contentElement.className = 'log-entry-content';
            contentElement.innerHTML = NarseseHighlighter.highlight(content);
        }

        const timeElement = this._createLogElement('span', 'log-entry-time', timestamp, `time-${this.messageCounter}`);

        logEntry.appendChild(iconElement);
        logEntry.appendChild(contentElement);
        logEntry.appendChild(timeElement);

        const {scrollTop, scrollHeight, clientHeight} = this.container;
        const isScrolledToBottom = Math.abs(scrollHeight - (scrollTop + clientHeight)) < 5; // Tolerance

        this.container.appendChild(logEntry);

        if (isScrolledToBottom) {
            this._autoScrollToBottom();
        }

        this.messageCounter++;
        return logEntry;
    }

    _autoScrollToBottom() {
        if (!this.container) return;
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(() => {
                this.container.scrollTop = this.container.scrollHeight;
            });
        } else {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }

    _createLogElement(tag, className, textContent, id = null) {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = textContent;
        if (id) element.id = id;
        return element;
    }

    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
