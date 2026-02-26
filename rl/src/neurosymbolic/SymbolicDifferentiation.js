import { SymbolicTensor, TensorLogicBridge } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULT_CONFIG = {
    trackProvenance: true,
    symbolicThreshold: 0.3
};

export class SymbolicDifferentiation {
    constructor(config = {}) {
        this.config = mergeConfig(DEFAULT_CONFIG, config);
        this.gradientGraph = new Map();
        this.symbolicGradients = new Map();
        this.bridge = new TensorLogicBridge();
    }

    gradient(loss, params, context = new Map()) {
        const gradients = [];
        params.forEach(param => {
            const grad = this.computeGradient(loss, param, context);
            if (param instanceof SymbolicTensor) {
                const symbolicGrad = this.annotateGradient(grad, param);
                gradients.push(symbolicGrad);
                this.symbolicGradients.set(param, symbolicGrad);
            } else {
                gradients.push(grad);
            }
        });
        return gradients;
    }

    computeGradient(loss, param, context) {
        const eps = 1e-5;
        const grad = new Float32Array(param.data.length);
        const lossBase = typeof loss === 'function' ? loss() : loss.data ? loss.data[0] : loss;

        for (let i = 0; i < param.data.length; i++) {
            const original = param.data[i];
            try {
                param.data[i] = original + eps;
                const lossPlus = typeof loss === 'function' ? loss() : loss.data ? loss.data[0] : loss;
                grad[i] = (lossPlus - lossBase) / eps;
            } finally {
                param.data[i] = original;
            }
        }

        if (this.config.trackProvenance) this.trackGradientFlow(param, grad, context);
        return grad;
    }

    annotateGradient(grad, param) {
        const symbolicGrad = new SymbolicTensor(grad, param.shape);
        param.symbols.forEach((symbolInfo, key) => {
            const idx = typeof key === 'string' ? parseInt(key.split(',')[0]) : key;
            if (!isNaN(idx) && idx < grad.length && Math.abs(grad[idx]) > this.config.symbolicThreshold) {
                symbolicGrad.annotate(idx, `∂${symbolInfo.symbol}`, symbolInfo.confidence * Math.abs(grad[idx]));
            }
        });
        symbolicGrad.addProvenance('SymbolicDifferentiation', 'annotateGradient', { paramSymbols: param.symbols.size });
        return symbolicGrad;
    }

    trackGradientFlow(param, grad, context) {
        this.gradientGraph.set(param, { grad, context: new Map(context), timestamp: Date.now() });
    }

    getSymbolicGradient(param) { return this.symbolicGradients.get(param); }
    getGradientGraph() { return new Map(this.gradientGraph); }

    explainGradient(param) {
        const symbolicGrad = this.symbolicGradients.get(param);
        if (!symbolicGrad) return { explanation: 'No gradient computed', symbols: [] };

        const symbols = [];
        symbolicGrad.symbols.forEach((info, key) => {
            symbols.push({ symbol: info.symbol, confidence: info.confidence });
        });

        return {
            explanation: `Gradient influenced by ${symbols.length} symbolic features`,
            symbols
        };
    }

    analyzeGradientFlow() {
        const nodes = Array.from(this.gradientGraph.values());
        if (nodes.length === 0) return { totalNodes: 0, avgMagnitude: 0 };

        let totalMag = 0;
        let count = 0;

        nodes.forEach(node => {
            const grad = node.grad;
            if (grad) {
                for (let i = 0; i < grad.length; i++) totalMag += Math.abs(grad[i]);
                count += grad.length;
            }
        });

        return {
            totalNodes: this.gradientGraph.size,
            avgMagnitude: count > 0 ? totalMag / count : 0
        };
    }

    clear() { this.gradientGraph.clear(); this.symbolicGradients.clear(); }
}
