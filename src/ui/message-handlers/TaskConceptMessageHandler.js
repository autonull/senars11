import {BaseMessageHandler} from './BaseMessageHandler.js';
// Note: FormattingUtils import path may need to be updated based on the actual project structure
// import {FormattingUtils} from '/src/util/FormattingUtils.js'; // This path appears to be incorrect

/**
 * Handler for task and concept related messages
 */
export class TaskConceptMessageHandler extends BaseMessageHandler {
    /**
     * Create a task-related message
     */
    handleTaskMessage(message) {
        const payload = message.payload || {};
        let content;

        if (payload.term) {
            // Format task manually since FormattingUtils isn't available
            content = payload.term.toString();
            if (payload.truth) {
                const {frequency, confidence} = payload.truth;
                content += ` {${frequency?.toFixed(2) ?? '0.00'}, ${confidence?.toFixed(2) ?? '0.00'}}`;
            }
        } else {
            content = JSON.stringify(payload);
        }

        return this._formatMessage(payload, content, 'task', '📥');
    }

    /**
     * Create a concept-related message
     */
    handleConceptMessage(message) {
        const payload = message.payload || {};
        const term = payload.term ? payload.term.toString() : JSON.stringify(payload);
        return this._formatMessage(payload, `Concept: ${term}`, 'concept', '🧠');
    }
}
