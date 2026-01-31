/**
 * BaseMeTTaComponent.js - Base class for MeTTa subsystems
 * Extends SeNARS BaseComponent with MeTTa-specific functionality
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized, Deeply deduplicated
 */

import {BaseComponent} from '../../../core/src/util/BaseComponent.js';

/**
 * BaseMeTTaComponent - Base class for all MeTTa components
 * Provides common functionality: logging, metrics, events, lifecycle
 */
export class BaseMeTTaComponent extends BaseComponent {
    constructor(config = {}, name = 'BaseMeTTaComponent', eventBus = null, termFactory = null) {
        super(config, name, eventBus);
        this.termFactory = termFactory;
        this._mettaMetrics = new Map();
    }

    // ===== MeTTa-specific helpers =====

    /**
     * Emit MeTTa-namespaced event
     */
    emitMeTTaEvent(eventName, data) {
        this.emitEvent(`metta:${eventName}`, () => ({
            component: this._name,
            timestamp: Date.now(),
            ...data
        }));
    }

    /**
     * Update metrics for an operation
     */
    _updateMetrics(metricKey, duration) {
        const current = this._mettaMetrics.get(metricKey) ?? {count: 0, totalTime: 0, errors: 0, avgTime: 0, lastDuration: 0};
        const newCount = current.count + 1;
        const newTotal = current.totalTime + duration;

        this._mettaMetrics.set(metricKey, {
            count: newCount,
            totalTime: newTotal,
            errors: current.errors,
            avgTime: newTotal / newCount,
            lastDuration: duration
        });
    }

    /**
     * Record operation error in metrics
     */
    _recordError(metricKey) {
        const current = this._mettaMetrics.get(metricKey) ?? {count: 0, totalTime: 0, errors: 0, avgTime: 0, lastDuration: 0};
        this._mettaMetrics.set(metricKey, {
            ...current,
            errors: current.errors + 1
        });
    }

    /**
     * Track a MeTTa operation with timing and metrics
     */
    trackOperation(opName, fn) {
        const start = Date.now();
        const metricKey = `${this._name}.${opName}`;

        try {
            const result = fn();
            const duration = Date.now() - start;

            this._updateMetrics(metricKey, duration);

            if (duration > (this.config.slowOpThreshold ?? 100)) {
                this.emitMeTTaEvent('slow-operation', {opName, duration});
            }

            return result;
        } catch (error) {
            this._recordError(metricKey);
            this.logError(`${opName} failed`, {error: error.message, stack: error.stack});
            this.emitMeTTaEvent('operation-error', {opName, error: error.message});
            throw error;
        }
    }

    /**
     * Track async operation
     */
    async trackOperationAsync(opName, fn) {
        const start = Date.now();
        const metricKey = `${this._name}.${opName}`;

        try {
            const result = await fn();
            this._updateMetrics(metricKey, Date.now() - start);
            return result;
        } catch (error) {
            this._recordError(metricKey);
            this.logError(`${opName} failed`, {error: error.message});
            this.emitMeTTaEvent('operation-error', {opName, error: error.message});
            throw error;
        }
    }

    /**
     * Get MeTTa-specific metrics
     */
    getMeTTaMetrics() {
        return Object.fromEntries(
            Array.from(this._mettaMetrics, ([key, value]) => [key, {...value}])
        );
    }

    /**
     * Reset MeTTa metrics
     */
    resetMeTTaMetrics() {
        this._mettaMetrics.clear();
    }

    /**
     * Get comprehensive stats including base and MeTTa metrics
     */
    getStats() {
        return {
            ...super.getMetrics(),
            mettaMetrics: this.getMeTTaMetrics(),
            component: this._name
        };
    }
}
