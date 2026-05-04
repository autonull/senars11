import {ActionTypes, ActivityTypes} from './ActivityTypes.js';

/**
 * Registry of available actions for different activity types.
 * Defines the "context menu" for each log entry.
 */
export class ActionRegistry {
    /**
     * Get applicable actions for a given activity.
     * @param {Object} activity
     * @returns {Array} List of action definitions {id, label, type, icon}
     */
    static getActionsForActivity(activity) {
        const actions = [];
        const {type} = activity;

        // Common actions
        actions.push({
            id: 'inspect',
            label: 'Inspect',
            type: ActionTypes.INSPECT,
            icon: '🔍'
        });

        // Reasoning specific
        if (type === ActivityTypes.REASONING.DERIVATION ||
            type === ActivityTypes.REASONING.GOAL ||
            type === ActivityTypes.REASONING.QUESTION) {

            // RLFP: Rate this reasoning step
            actions.push({
                id: 'rate_good',
                label: 'Good Reasoning',
                type: ActionTypes.RATE,
                payload: {value: 1},
                icon: '👍'
            });
            actions.push({
                id: 'rate_bad',
                label: 'Bad Reasoning',
                type: ActionTypes.RATE,
                payload: {value: -1},
                icon: '👎'
            });

            actions.push({
                id: 'trace',
                label: 'Show Trace',
                type: ActionTypes.TRACE,
                icon: 'tree'
            });
        }

        // LLM specific
        if (type === ActivityTypes.LLM.RESPONSE) {
            actions.push({
                id: 'rate_response',
                label: 'Rate Response',
                type: ActionTypes.RATE,
                icon: '⭐'
            });
        }

        return actions;
    }
}
