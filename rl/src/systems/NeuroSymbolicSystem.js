/**
 * Neuro-Symbolic System
 * Unified framework combining World Model and Symbolic Differentiation
 */
import {Component} from '../composable/Component.js';
import {TensorLogicBridge} from '@senars/tensor';
import {WorldModel} from '../models/WorldModel.js';
import {SymbolicDifferentiation} from '../models/SymbolicDifferentiation.js';

/**
 * Unified Neuro-Symbolic System
 * Combines world model for prediction with symbolic differentiation for explainability
 */
export class NeuroSymbolicSystem extends Component {
    constructor(config = {}) {
        super(config);
        this.worldModel = new WorldModel(config.worldModel ?? {});
        this.symbolicDiff = new SymbolicDifferentiation(config.symbolicDiff ?? {});
        this.bridge = new TensorLogicBridge();
    }

    static create(config = {}) {
        return new NeuroSymbolicSystem(config);
    }

    static createWithWorldModel(config = {}) {
        return new NeuroSymbolicSystem({
            ...config,
            worldModel: {...config.worldModel, ensembleSize: 10, uncertaintyThreshold: 0.3}
        });
    }

    static createWithExplanation(config = {}) {
        return new NeuroSymbolicSystem({
            ...config,
            symbolicDiff: {...config.symbolicDiff, trackProvenance: true}
        });
    }

    async onInitialize() {
        await this.worldModel.initialize();
        this.emit('initialized', {
            worldModel: true,
            symbolicDiff: true
        });
    }

    async update(state, action, nextState, reward) {
        await this.worldModel.update(state, action, nextState, reward);
        return {updated: true};
    }

    async imagine(initialState, horizon = 10) {
        return this.worldModel.imagine(initialState, horizon);
    }

    computeGradient(loss, params) {
        return this.symbolicDiff.gradient(loss, params);
    }

    explainGradient(param) {
        return this.symbolicDiff.explainGradient(param);
    }

    getStats() {
        return {
            worldModel: this.worldModel.getStats(),
            symbolicDiff: this.symbolicDiff.getStats()
        };
    }

    async onShutdown() {
        await this.worldModel.shutdown();
        this.symbolicDiff.clear();
    }
}

// Re-exports for backward compatibility
export {WorldModel};
export {WorldModel as Model};
export {SymbolicDifferentiation};
export {SymbolicDifferentiation as SymbolicGrad};
export {NeuroSymbolicSystem as NeuroSymbolic};
