import {BaseMessageHandler} from './BaseMessageHandler.js';

/**
 * Handler for question and reasoning related messages
 */
export class QuestionReasoningMessageHandler extends BaseMessageHandler {
    /**
     * Handle question answered messages
     */
    handleQuestionAnswered(msg) {
        const payload = msg.payload || {};
        const answer = payload.answer || payload.task || payload;
        return {
            content: `Answer: ${this._formatTask(answer)}`,
            type: 'info',
            icon: '❓'
        };
    }

    /**
     * Handle reasoning derivation messages
     */
    handleReasoningDerivation(msg) {
        const payload = msg.payload || {};
        const derivation = payload.derivation || payload.task || payload;
        return {
            content: `OUT: ${this._formatTask(derivation)}`,
            type: 'info',
            icon: '🔍'
        };
    }

    /**
     * Handle reasoning step messages
     */
    handleReasoningStep(msg) {
        // Steps might be raw text
        const payload = msg.payload || {};
        const content = payload.text || JSON.stringify(payload);
        return {
            content: content,
            type: 'info',
            icon: '🔍'
        };
    }

    _formatTask(task) {
        if (!task) return 'Unknown task';
        // Handle if task is nested or structure varies
        const termObj = task.term;
        const termStr = termObj?._name || termObj || 'Unknown term';

        // Determine punctuation from type if not explicit
        let punctuation = task.punctuation || '.';
        if (!task.punctuation && task.type) {
            if (task.type === 'QUESTION') punctuation = '?';
            else if (task.type === 'GOAL') punctuation = '!';
        }

        const truth = task.truth ? `%${Number(task.truth.frequency || 0).toFixed(2)};${Number(task.truth.confidence || 0).toFixed(2)}%` : '';
        return `${termStr}${punctuation} ${truth}`.trim();
    }
}
