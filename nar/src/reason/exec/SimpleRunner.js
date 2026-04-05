import {Runner} from './Runner.js';
import {Logger} from '@senars/core';

/**
 * A simple, sequential execution runner that processes reasoning steps in a loop.
 * This avoids complex async streams and backpressure mechanisms, favoring predictability.
 */
export class SimpleRunner extends Runner {
    constructor(reasoner, config = {}) {
        super(reasoner, config);
        this.interval = config.executionInterval ?? 100;
        this.stepTimeout = config.stepTimeout ?? 500;
        this.isRunning = false;
        this.loopPromise = null;
        this.metrics = {
            totalCycles: 0,
            totalDerivations: 0,
            lastDerivationTime: null
        };
    }

    start() {
        if (this.isRunning) {return;}
        this.isRunning = true;
        this.loopPromise = this._loop();
    }

    async stop() {
        this.isRunning = false;
        if (this.loopPromise) {
            await this.loopPromise;
            this.loopPromise = null;
        }
    }

    async _loop() {
        while (this.isRunning) {
            try {
                const start = Date.now();

                const results = await this.reasoner.step(this.stepTimeout, false);
                this._updateMetrics(results);

                const elapsed = Date.now() - start;
                const delay = Math.max(10, this.interval - elapsed);

                await this._wait(delay);
            } catch (error) {
                Logger.error('SimpleRunner loop error:', error);
                await this._wait(1000);
            }
        }
    }

    _updateMetrics(results) {
        this.metrics.totalCycles++;
        if (results?.length > 0) {
            this.metrics.totalDerivations += results.length;
            this.metrics.lastDerivationTime = Date.now();
        }
    }

    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getMetrics() {
        return {
            mode: 'simple',
            ...this.metrics
        };
    }
}
