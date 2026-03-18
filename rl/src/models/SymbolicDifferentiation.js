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
        return params.map(param => {
            const grad = this.computeGradient(loss, param, context);
            if (!(param instanceof SymbolicTensor)) return grad;

            const symbolicGrad = this.annotateGradient(grad, param);
            this.symbolicGradients.set(param, symbolicGrad);
            return symbolicGrad;
        });
    }

    computeGradient(loss, param, context) {
        const eps = 1e-5;
        const grad = new Float32Array(param.data.length);
        const getLoss = () => typeof loss === 'function' ? loss() : loss.data ? loss.data[0] : loss;
        const lossBase = getLoss();

        for (let i = 0; i < param.data.length; i++) {
            const original = param.data[i];
            try {
                param.data[i] = original + eps;
                grad[i] = (getLoss() - lossBase) / eps;
            } finally {
                param.data[i] = original;
            }
        }

        if (this.config.trackProvenance) this.trackGradientFlow(param, grad, context);
        return grad;
    }

    annotateGradient(grad, param) {
        const symbolicGrad = new SymbolicTensor(grad, param.shape);
        for (const [key, symbolInfo] of param.symbols) {
            const idx = typeof key === 'string' ? parseInt(key.split(',')[0]) : key;
            if (!isNaN(idx) && idx < grad.length && Math.abs(grad[idx]) > this.config.symbolicThreshold) {
                symbolicGrad.annotate(idx, `∂${symbolInfo.symbol}`, symbolInfo.confidence * Math.abs(grad[idx]));
            }
        }
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

        const symbols = Array.from(symbolicGrad.symbols.values())
            .map(info => ({ symbol: info.symbol, confidence: info.confidence }));

        return {
            explanation: `Gradient influenced by ${symbols.length} symbolic features`,
            symbols
        };
    }

    analyzeGradientFlow() {
        const nodes = Array.from(this.gradientGraph.values());
        if (nodes.length === 0) return { totalNodes: 0, avgMagnitude: 0 };

        const { totalMag, count } = nodes.reduce((acc, node) => {
            if (!node.grad) return acc;
            const mag = node.grad.reduce((sum, val) => sum + Math.abs(val), 0);
            return { totalMag: acc.totalMag + mag, count: acc.count + node.grad.length };
        }, { totalMag: 0, count: 0 });

        return {
            totalNodes: this.gradientGraph.size,
            avgMagnitude: count > 0 ? totalMag / count : 0
        };
    }

    getStats() {
        return {
            gradientGraphSize: this.gradientGraph.size,
            symbolicGradientsCount: this.symbolicGradients.size
        };
    }

    clear() { this.gradientGraph.clear(); this.symbolicGradients.clear(); }
}
