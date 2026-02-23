
export const ParameterInitializer = {
    xavier(fanIn, fanOut) {
        const limit = Math.sqrt(6 / (fanIn + fanOut));
        return () => (Math.random() * 2 - 1) * limit;
    }
};

export const PolicyUtils = {
    argmax(array) {
        if (!array || array.length === 0) return -1;
        return array.reduce((maxIdx, val, i) => val > array[maxIdx] ? i : maxIdx, 0);
    },

    sampleCategorical(probs) {
        const rand = Math.random();
        let cumsum = 0;
        for (let i = 0; i < probs.length; i++) {
            cumsum += probs[i];
            if (rand < cumsum) return i;
        }
        return probs.length - 1;
    },

    sampleGaussian() {
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },

    gaussianPdf(x, mu, std) {
        if (Array.isArray(x)) {
            return x.reduce((prod, xi, i) => prod * this.gaussianPdf(xi, mu[i], std), 1);
        }
        const coeff = 1 / (std * Math.sqrt(2 * Math.PI));
        const exponent = -0.5 * Math.pow((x - mu) / std, 2);
        return coeff * Math.exp(exponent);
    },

    findStateActionPatterns(pairs) {
        const correlations = new Map();

        pairs.forEach(({ state, action }) => {
            if (Array.isArray(state) || ArrayBuffer.isView(state)) {
                state.forEach((val, i) => {
                    const key = `feature_${i}_action_${action}`;
                    const prev = correlations.get(key) ?? { count: 0, sum: 0 };
                    correlations.set(key, { count: prev.count + 1, sum: prev.sum + val });
                });
            }
        });

        return Array.from(correlations.entries())
            .filter(([_, stats]) => stats.count > 5)
            .map(([pattern, stats]) => ({
                type: 'correlation',
                pattern,
                avgFeatureValue: stats.sum / stats.count,
                frequency: stats.count
            }));
    }
};
