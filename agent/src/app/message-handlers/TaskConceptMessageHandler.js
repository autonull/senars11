import {BaseMessageHandler} from './BaseMessageHandler.js';

/**
 * Handler for task and concept related messages
 */
export class TaskConceptMessageHandler extends BaseMessageHandler {
    /**
     * Create a task-related message
     */
    handleTaskMessage(message) {
        const payload = message.payload || {};
        const task = payload.task || payload;
        let content;

        // Handle term being an object or string
        let termStr = '';
        const {term} = task;

        if (term) {
            if (typeof term === 'string') {
                termStr = term;
            } else if (typeof term === 'object') {
                termStr = term._name || term.name || term.toString();
                if (termStr === '[object Object]') {
                    termStr = JSON.stringify(term);
                }
            }
        }

        if (termStr) {
            content = termStr;
            const truth = task.truth || payload.truth;
            if (truth) {
                const {frequency, confidence} = truth;
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
