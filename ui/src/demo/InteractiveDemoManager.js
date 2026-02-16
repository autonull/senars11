import { GuidanceOverlay } from '../utils/GuidanceOverlay.js';

/**
 * InteractiveDemoManager extends demo capabilities to handle user interaction requests
 */
export class InteractiveDemoManager {
    constructor(demoManager) {
        this.demoManager = demoManager;
        this.logger = demoManager.logger;
        this.commandProcessor = demoManager.commandProcessor;
        this.guidance = new GuidanceOverlay();
    }

    /**
     * Handle requests from the demo (e.g., asking for user input via a widget)
     * @param {Object} payload - { requestId, type, widgetType, config, prompt }
     */
    handleDemoRequest(payload) {
        if (!payload) return;

        // Handle Guidance Highlight
        if (payload.type === 'ui_highlight') {
            this.guidance.highlight(payload.selector, payload.message, payload.duration);
            return;
        }

        this.logger.log(`Demo Request: ${payload.prompt || 'Input required'}`, 'input', '❓');

        if (payload.type === 'widget_input') {
            this._presentWidgetInput(payload);
        }
    }

    _presentWidgetInput(payload) {
        // Create a log entry that serves as the interaction container
        // We use the LogViewer's mechanism to render a widget, but we wrap it to handle the response
        const requestEntry = {
            type: 'widget',
            widgetType: payload.widgetType,
            config: {
                ...payload.config,
                onChange: (value) => this._handleWidgetResponse(payload.requestId, value)
            }
        };

        this.logger.log(requestEntry, 'input', '🎮');
    }

    _handleWidgetResponse(requestId, value) {
        // Send the response back to the backend
        this.logger.log(`User provided input for request ${requestId}`, 'info', '✅');

        // In a real scenario, this would send a message to the backend
        this.commandProcessor.webSocketManager.sendMessage('demo.response', {
            requestId: requestId,
            value: value
        });
    }
}
