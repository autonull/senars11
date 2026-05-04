import {getHeapUsed} from '@senars/core/src/util/common.js';

export class AdaptiveController {
    constructor(config = {}) {
        this.config = config;
        this.metrics = {
            totalDerivations: 0,
            startTime: null,
            lastDerivationTime: null,
            totalProcessingTime: 0,
            cpuThrottleCount: 0,
            backpressureEvents: 0,
            lastBackpressureTime: null
        };
        this.performance = {
            throughput: 0,
            avgProcessingTime: 0,
            memoryUsage: 0,
            backpressureLevel: 0
        };
        this.outputConsumerSpeed = 0;
        this.lastConsumerCheckTime = Date.now();
        this.consumerDerivationCount = 0;
    }

    start() {
        this.metrics.startTime = Date.now();
    }

    reset() {
        this.metrics.startTime = Date.now();
        this.metrics.totalDerivations = 0;
        this.metrics.totalProcessingTime = 0;
        this.consumerDerivationCount = 0;
    }

    recordDerivation(processingTime) {
        this.metrics.totalDerivations++;
        this.metrics.lastDerivationTime = Date.now();
        this.metrics.totalProcessingTime += processingTime;
    }

    recordThrottle() {
        this.metrics.cpuThrottleCount++;
    }

    async updateAndAdapt() {
        this._updatePerformanceMetrics();
        await this._adaptProcessingRate();
    }

    async checkBackpressure() {
        const now = Date.now();
        if (now - this.lastConsumerCheckTime > 1000) {
            this._updatePerformanceMetrics();

            if (this.performance.backpressureLevel > 10) {
                this.metrics.backpressureEvents++;
                this.metrics.lastBackpressureTime = now;
                const delay = this.config.backpressureInterval ?? 10;
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            this.lastConsumerCheckTime = now;
        }
    }

    _updatePerformanceMetrics() {
        if (this.metrics.startTime && this.metrics.totalDerivations > 0) {
            const elapsed = (this.metrics.lastDerivationTime - this.metrics.startTime) / 1000;
            this.performance.throughput = elapsed > 0 ? this.metrics.totalDerivations / elapsed : 0;
            this.performance.avgProcessingTime = this.metrics.totalProcessingTime / this.metrics.totalDerivations;
        }

        this.performance.memoryUsage = getHeapUsed();

        const now = Date.now();
        if (this.lastConsumerCheckTime) {
            const timeDiff = (now - this.lastConsumerCheckTime) / 1000;
            if (timeDiff > 0) {
                this.outputConsumerSpeed = (this.metrics.totalDerivations - this.consumerDerivationCount) / timeDiff;
                this.performance.backpressureLevel = Math.max(0, this.outputConsumerSpeed - this.performance.throughput);
            }
        }

        // Don't reset lastConsumerCheckTime here, done in checkBackpressure
        this.consumerDerivationCount = this.metrics.totalDerivations;
    }

    async _adaptProcessingRate() {
        let adjustmentFactor = 1.0;

        if (this.performance.backpressureLevel > 20) {
            adjustmentFactor = 0.5;
        } else if (this.performance.backpressureLevel > 5) {
            adjustmentFactor = 0.8;
        } else if (this.performance.backpressureLevel < -5) {
            adjustmentFactor = 1.2;
        }

        const baseThrottle = this.config.cpuThrottleInterval ?? 0;
        const newThrottle = Math.max(0, baseThrottle / adjustmentFactor);
        this.config.cpuThrottleInterval = this.config.cpuThrottleInterval * 0.9 + newThrottle * 0.1;

        const baseBackpressureInterval = this.config.backpressureInterval ?? 10;
        this.config.backpressureInterval = Math.max(1, baseBackpressureInterval / adjustmentFactor);
    }

    handleFeedback(feedback) {
        if (typeof feedback.processingSpeed === 'number') {
            this.outputConsumerSpeed = feedback.processingSpeed;
        }

        if (typeof feedback.backlogSize === 'number') {
            if (feedback.backlogSize > this.config.backpressureThreshold) {
                this.config.cpuThrottleInterval = Math.min(
                    this.config.cpuThrottleInterval * 1.5,
                    this.config.cpuThrottleInterval + 5
                );
            } else if (feedback.backlogSize < this.config.backpressureThreshold / 2) {
                this.config.cpuThrottleInterval = Math.max(
                    this.config.cpuThrottleInterval * 0.9,
                    Math.max(0, this.config.cpuThrottleInterval - 1)
                );
            }
        }

        this.performance.backpressureLevel = feedback.backlogSize ?? 0;
    }

    getMetrics() {
        this._updatePerformanceMetrics();
        return {
            ...this.metrics,
            ...this.performance,
            outputConsumerSpeed: this.outputConsumerSpeed
        };
    }
}
