import {Runner} from './Runner.js';
import {Logger} from '@senars/core/src/util/Logger.js';
import {AdaptiveController} from './AdaptiveController.js';

export class PipelineRunner extends Runner {
    constructor(reasoner, config = {}) {
        super(reasoner, config);
        this.controller = new AdaptiveController(this.config);
        this._outputStream = null;
        this.abortController = null;
        this.isRunning = false;
    }

    get outputStream() {
        return this._outputStream ??= this._createOutputStream();
    }

    start() {
        if (this.isRunning) {
            Logger.warn('PipelineRunner is already running');
            return;
        }

        this.isRunning = true;
        this.abortController = new AbortController();
        this.controller.start();
        this._runPipeline();
    }

    async stop() {
        this.isRunning = false;
        this.abortController?.abort();
        this.abortController = null;
        this._outputStream = null;
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    async* _createOutputStream() {
        try {
            const premiseStream = this.reasoner.premiseSource.stream(this.abortController?.signal);
            const premisePairStream = this.reasoner.strategy.generatePremisePairs(premiseStream);
            const derivationStream = this.reasoner.ruleProcessor.process(premisePairStream, 1000, this.abortController?.signal);

            for await (const derivation of derivationStream) {
                if (this.config.cpuThrottleInterval > 0) {
                    await this._cpuThrottle();
                    this.controller.recordThrottle();
                }

                yield derivation;
            }
        } catch (error) {
            Logger.debug('Error in output stream creation:', error.message);
        }
    }

    async _cpuThrottle() {
        if (this.config.cpuThrottleInterval > 0) {
            return new Promise(resolve => setTimeout(resolve, this.config.cpuThrottleInterval));
        }
    }

    async _runPipeline() {
        try {
            for await (const derivation of this.outputStream) {
                if (!this.isRunning) break;

                const startTime = Date.now();
                this.reasoner._processDerivation(derivation);
                this.controller.recordDerivation(Date.now() - startTime);

                if (this.controller.metrics.totalDerivations % 50 === 0) {
                    await this.controller.updateAndAdapt();
                }

                await this.controller.checkBackpressure();
            }
        } catch (error) {
            Logger.error('Error in reasoning pipeline:', error);
        } finally {
            this.isRunning = false;
        }
    }

    getMetrics() {
        return this.controller.getMetrics();
    }

    receiveConsumerFeedback(feedback) {
        this.controller.handleFeedback(feedback);
    }
}
