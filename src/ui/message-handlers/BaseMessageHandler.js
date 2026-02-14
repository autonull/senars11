/**
 * Base message handler class
 */
export class BaseMessageHandler {
    /**
     * Generic message formatter with icon mapping
     */
    _formatMessage(payload, defaultContent, type, icon) {
        return {
            content: payload?.result || payload?.message || payload?.answer || payload?.question ||
                payload?.derivation || payload?.step || payload?.task || payload?.input ||
                payload?.concept || payload?.term || defaultContent,
            type,
            icon
        };
    }

    /**
     * Create a default message for unknown types
     */
    _createDefaultMessage(message) {
        const content = message.payload || message.data || message;
        return {
            content: `${message.type}: ${JSON.stringify(content)}`,
            type: 'info',
            icon: '📝'
        };
    }
}