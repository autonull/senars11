import {generateId} from '@senars/core';

/**
 * ActivityModel manages the state of the activity stream.
 * It is used on both Backend (for buffering) and Frontend (for display).
 */
export class ActivityModel {
    constructor(options = {}) {
        this.limit = options.limit || 100;
        this.activities = [];
        this.listeners = new Set();
    }

    addActivity(activity) {
        if (!activity.id) {
            activity.id = generateId('activity');
        }
        if (!activity.timestamp) {
            activity.timestamp = Date.now();
        }

        this.activities.unshift(activity);

        if (this.activities.length > this.limit) {
            this.activities.pop();
        }

        this._notifyListeners('add', activity);
        return activity;
    }

    /**
     * Clear all activities.
     */
    clear() {
        this.activities = [];
        this._notifyListeners('clear');
    }

    /**
     * Get current activities.
     */
    getActivities() {
        return this.activities;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    _notifyListeners(event, data) {
        for (const listener of this.listeners) {
            listener(event, data, this.activities);
        }
    }
}
