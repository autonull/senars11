import {ActionTypes} from './ActivityTypes.js';
import { Logger } from '@senars/core';

/**
 * ActionDispatcher handles execution of actions triggered by the UI.
 * It routes actions to the appropriate backend service (RLFP, NAR, etc.)
 */
export class ActionDispatcher {
    constructor(engine, preferenceCollector) {
        this.engine = engine;
        this.preferenceCollector = preferenceCollector;
    }

    /**
     * Dispatch an action.
     * @param {Object} action - The action object {type, id, payload, context}
     */
    async dispatch(action) {
        Logger.debug(`[ActionDispatcher] Dispatching ${action.type}`, action);

        switch (action.type) {
            case ActionTypes.RATE:
                return this._handleRate(action);

            case ActionTypes.INSPECT:
                return this._handleInspect(action);

            case ActionTypes.TRACE:
                return this._handleTrace(action);

            default:
                Logger.warn(`Unknown action type: ${action.type}`);
                return {success: false, error: 'Unknown action type'};
        }
    }

    async _handleRate(action) {
        if (!this.preferenceCollector) {
            return {success: false, error: 'PreferenceCollector not available'};
        }

        const {value} = action.payload || {};
        const {activityId, rawActivity} = action.context || {};

        this.preferenceCollector.addPreference({
            activityId,
            rating: value,
            activityType: rawActivity?.type,
            source: 'ui_action'
        });

        return {success: true, message: 'Rating recorded'};
    }

    async _handleInspect(action) {
        // Just log for now, could trigger a "Focus" event in the graph
        Logger.debug('Inspect requested for:', action.context?.activityId);
        return {success: true};
    }

    async _handleTrace(action) {
        // Trigger trace generation or enable tracing
        // This might interact with the engine
        return {success: true, message: 'Trace requested (not implemented)'};
    }
}
