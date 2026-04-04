import { SymbolicTensor } from '@senars/tensor';

let _lastGate = null;

export const NeuroSymbolicFusion = {
    get _lastGate() { return _lastGate; },

    gatedFusion(neural, symbolic) {
        const nStrength = this.signalStrength(neural);
        const sStrength = this.signalStrength(symbolic);
        const gate = nStrength / (nStrength + sStrength || 1);
        _lastGate = gate;
        _lastGate = gate;

        const neuralContrib = this.scale(neural, gate);
        const symbolContrib = this.scale(symbolic, 1 - gate);
        return this.add(neuralContrib, symbolContrib);
    },

    concatFusion(neural, symbolic) {
        const nData = neural.data ?? neural;
        const sData = symbolic.data ?? symbolic;
        const concatenated = new Float32Array(nData.length + sData.length);
        concatenated.set(nData, 0);
        concatenated.set(sData, nData.length);
        return new SymbolicTensor(concatenated, [concatenated.length]);
    },

    addFusion(neural, symbolic) {
        const nData = neural.data ?? neural;
        const sData = symbolic.data ?? symbolic;
        const len = Math.min(nData.length, sData.length);
        const added = new Float32Array(len);
        for (let i = 0; i < len; i++) added[i] = nData[i] + sData[i];
        return new SymbolicTensor(added, [len]);
    },

    signalStrength(tensor) {
        const data = tensor.data ?? tensor;
        return data.reduce((sum, v) => sum + Math.abs(v), 0) / data.length;
    },

    scale(tensor, factor) {
        const data = tensor.data ?? tensor;
        const scaled = new Float32Array(data.map(v => v * factor));
        if (tensor instanceof SymbolicTensor) {
            const result = tensor.clone();
            result.data = scaled;
            return result;
        }
        return new SymbolicTensor(scaled, tensor.shape ?? [scaled.length]);
    },

    add(t1, t2) {
        const d1 = t1.data ?? t1;
        const d2 = t2.data ?? t2;
        const len = Math.min(d1.length, d2.length);
        const added = new Float32Array(len);
        for (let i = 0; i < len; i++) added[i] = d1[i] + d2[i];
        return new SymbolicTensor(added, [len]);
    }
};
