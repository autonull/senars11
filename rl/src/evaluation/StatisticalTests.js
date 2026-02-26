/**
 * Statistical Tests Module
 * Comprehensive statistical analysis for RL evaluation
 */

const MathUtils = {
    mean(arr) {
        return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    median(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },

    variance(arr, mean) {
        const m = mean ?? this.mean(arr);
        return arr.length < 2 ? 0 : arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
    },

    std(arr, mean) {
        return Math.sqrt(this.variance(arr, mean));
    },

    sem(arr) {
        return arr.length < 2 ? 0 : this.std(arr) / Math.sqrt(arr.length);
    },

    confidenceInterval(arr, confidence = 0.95) {
        if (arr.length < 2) return { lower: 0, upper: 0, margin: 0 };

        const mean = this.mean(arr);
        const sem = this.sem(arr);
        const zScores = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
        const z = zScores[confidence] ?? 1.96;
        const margin = z * sem;

        return {
            lower: mean - margin,
            upper: mean + margin,
            margin,
            mean,
            confidence
        };
    },

    normalCDF(x) {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - prob : prob;
    },

    percentile(arr, p) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    },

    fDistributionPValue(f, df1, df2) {
        const x = df2 / (df2 + df1 * f);
        return Math.pow(x, df2 / 2);
    }
};

/**
 * Statistical hypothesis testing
 */
export class StatisticalTests {
    /**
     * Independent samples t-test
     * @param {number[]} sample1 - First sample
     * @param {number[]} sample2 - Second sample
     * @param {number} alpha - Significance level
     * @returns {object} Test results
     */
    static tTest(sample1, sample2, alpha = 0.05) {
        const n1 = sample1.length;
        const n2 = sample2.length;

        if (n1 < 2 || n2 < 2) {
            return { significant: false, pValue: 1.0, error: 'Sample sizes too small' };
        }

        const mean1 = MathUtils.mean(sample1);
        const mean2 = MathUtils.mean(sample2);
        const var1 = MathUtils.variance(sample1, mean1);
        const var2 = MathUtils.variance(sample2, mean2);

        const se = Math.sqrt(var1 / n1 + var2 / n2);
        if (se === 0) return { significant: false, pValue: 1.0, tStatistic: 0 };

        const t = (mean1 - mean2) / se;
        const df = n1 + n2 - 2;
        const pValue = 2 * (1 - MathUtils.normalCDF(Math.abs(t)));

        return {
            significant: pValue < alpha,
            pValue,
            tStatistic: t,
            degreesOfFreedom: df,
            mean1,
            mean2,
            effectSize: (mean1 - mean2) / Math.sqrt((var1 + var2) / 2),
            confidenceInterval: MathUtils.confidenceInterval([...sample1, ...sample2])
        };
    }

    /**
     * Welch's t-test (unequal variances)
     * @param {number[]} sample1 - First sample
     * @param {number[]} sample2 - Second sample
     * @param {number} alpha - Significance level
     * @returns {object} Test results
     */
    static welchTTest(sample1, sample2, alpha = 0.05) {
        const n1 = sample1.length;
        const n2 = sample2.length;

        if (n1 < 2 || n2 < 2) {
            return { significant: false, pValue: 1.0, error: 'Sample sizes too small' };
        }

        const mean1 = MathUtils.mean(sample1);
        const mean2 = MathUtils.mean(sample2);
        const var1 = MathUtils.variance(sample1, mean1);
        const var2 = MathUtils.variance(sample2, mean2);

        const se = Math.sqrt(var1 / n1 + var2 / n2);
        if (se === 0) return { significant: false, pValue: 1.0, tStatistic: 0 };

        const t = (mean1 - mean2) / se;

        const num = Math.pow(var1 / n1 + var2 / n2, 2);
        const denom = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1);
        const df = num / denom;

        const pValue = 2 * (1 - MathUtils.normalCDF(Math.abs(t)));

        return {
            significant: pValue < alpha,
            pValue,
            tStatistic: t,
            degreesOfFreedom: df,
            mean1,
            mean2,
            effectSize: (mean1 - mean2) / Math.sqrt((var1 + var2) / 2)
        };
    }

    /**
     * Wilcoxon signed-rank test (paired samples)
     * @param {number[]} sample1 - First sample
     * @param {number[]} sample2 - Second sample
     * @param {number} alpha - Significance level
     * @returns {object} Test results
     */
    static wilcoxonTest(sample1, sample2, alpha = 0.05) {
        if (sample1.length !== sample2.length) {
            return { significant: false, pValue: 1.0, error: 'Samples must be paired' };
        }

        const n = sample1.length;
        if (n < 5) return { significant: false, pValue: 1.0, error: 'Sample size too small' };

        const differences = sample1
            .map((v, i) => ({ diff: v - sample2[i], absDiff: Math.abs(v - sample2[i]) }))
            .filter(d => d.diff !== 0);

        if (differences.length === 0) return { significant: false, pValue: 1.0 };

        differences.sort((a, b) => a.absDiff - b.absDiff);
        differences.forEach((d, i) => d.rank = i + 1);

        const { wPlus, wMinus } = differences.reduce(
            (acc, d) => ({
                wPlus: acc.wPlus + (d.diff > 0 ? d.rank : 0),
                wMinus: acc.wMinus + (d.diff <= 0 ? d.rank : 0)
            }),
            { wPlus: 0, wMinus: 0 }
        );

        const w = Math.min(wPlus, wMinus);
        const nNonZero = differences.length;
        const mu = nNonZero * (nNonZero + 1) / 4;
        const sigma = Math.sqrt(nNonZero * (nNonZero + 1) * (2 * nNonZero + 1) / 24);
        const z = (w - mu) / sigma;
        const pValue = 2 * (1 - MathUtils.normalCDF(Math.abs(z)));

        return { significant: pValue < alpha, pValue, wStatistic: w, zScore: z };
    }

    /**
     * Permutation test (non-parametric)
     * @param {number[]} sample1 - First sample
     * @param {number[]} sample2 - Second sample
     * @param {number} alpha - Significance level
     * @param {number} permutations - Number of permutations
     * @returns {object} Test results
     */
    static permutationTest(sample1, sample2, alpha = 0.05, permutations = 10000) {
        const n1 = sample1.length;
        const n2 = sample2.length;
        const combined = [...sample1, ...sample2];
        const obsDiff = MathUtils.mean(sample1) - MathUtils.mean(sample2);

        let extreme = 0;
        for (let p = 0; p < permutations; p++) {
            const shuffled = [...combined].sort(() => Math.random() - 0.5);
            const permDiff = MathUtils.mean(shuffled.slice(0, n1)) - MathUtils.mean(shuffled.slice(n1));
            if (Math.abs(permDiff) >= Math.abs(obsDiff)) extreme++;
        }

        const pValue = extreme / permutations;
        return { significant: pValue < alpha, pValue, obsDiff, permutations };
    }

    /**
     * One-way ANOVA (multiple samples)
     * @param  {...number[]} samples - Samples to compare
     * @returns {object} Test results
     */
    static anova(...samples) {
        if (samples.length < 2) return { significant: false, error: 'Need at least 2 samples' };

        const k = samples.length;
        const allData = samples.flat();
        const grandMean = MathUtils.mean(allData);
        const N = allData.length;

        let ssBetween = 0;
        for (const sample of samples) {
            const groupMean = MathUtils.mean(sample);
            ssBetween += sample.length * Math.pow(groupMean - grandMean, 2);
        }

        let ssWithin = 0;
        for (const sample of samples) {
            const groupMean = MathUtils.mean(sample);
            ssWithin += sample.reduce((sum, x) => sum + Math.pow(x - groupMean, 2), 0);
        }

        const dfBetween = k - 1;
        const dfWithin = N - k;
        const msBetween = ssBetween / dfBetween;
        const msWithin = ssWithin / dfWithin;
        const f = msWithin > 0 ? msBetween / msWithin : Infinity;

        const pValue = MathUtils.fDistributionPValue(f, dfBetween, dfWithin);

        return {
            significant: pValue < 0.05,
            pValue,
            fStatistic: f,
            degreesOfFreedom: { between: dfBetween, within: dfWithin },
            ssBetween,
            ssWithin
        };
    }

    /**
     * Bootstrap confidence interval
     * @param {number[]} sample - Sample data
     * @param {string} statistic - Statistic to compute ('mean', 'median', 'std')
     * @param {number} confidence - Confidence level
     * @param {number} iterations - Bootstrap iterations
     * @returns {object} Confidence interval
     */
    static bootstrapCI(sample, statistic = 'mean', confidence = 0.95, iterations = 1000) {
        const n = sample.length;
        const stats = [];

        for (let i = 0; i < iterations; i++) {
            const resample = Array.from({ length: n }, () => sample[Math.floor(Math.random() * n)]);
            if (statistic === 'mean') {
                stats.push(MathUtils.mean(resample));
            } else if (statistic === 'median') {
                stats.push(MathUtils.median(resample));
            } else if (statistic === 'std') {
                stats.push(MathUtils.std(resample));
            }
        }

        stats.sort((a, b) => a - b);
        const lowerIdx = Math.floor((1 - confidence) / 2 * iterations);
        const upperIdx = Math.ceil((1 + confidence) / 2 * iterations);

        return {
            lower: stats[lowerIdx],
            upper: stats[upperIdx],
            mean: MathUtils.mean(stats),
            confidence,
            iterations
        };
    }
}

/**
 * Descriptive statistics utilities
 */
export const DescriptiveStats = {
    /**
     * Compute all basic statistics for a sample
     * @param {number[]} arr - Sample data
     * @returns {object} Statistics
     */
    summarize(arr) {
        if (arr.length === 0) {
            return { count: 0, mean: 0, median: 0, std: 0, min: 0, max: 0 };
        }

        const sorted = [...arr].sort((a, b) => a - b);
        return {
            count: arr.length,
            mean: MathUtils.mean(arr),
            median: MathUtils.median(arr),
            std: MathUtils.std(arr),
            variance: MathUtils.variance(arr),
            sem: MathUtils.sem(arr),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            q1: MathUtils.percentile(arr, 25),
            q3: MathUtils.percentile(arr, 75),
            range: sorted[sorted.length - 1] - sorted[0]
        };
    },

    /**
     * Compare two samples
     * @param {number[]} sample1 - First sample
     * @param {number[]} sample2 - Second sample
     * @returns {object} Comparison results
     */
    compare(sample1, sample2) {
        const stats1 = this.summarize(sample1);
        const stats2 = this.summarize(sample2);
        const tTest = StatisticalTests.tTest(sample1, sample2);

        return {
            sample1: stats1,
            sample2: stats2,
            difference: {
                meanDiff: stats1.mean - stats2.mean,
                percentDiff: ((stats1.mean - stats2.mean) / stats2.mean) * 100,
                effectSize: tTest.effectSize
            },
            significance: {
                significant: tTest.significant,
                pValue: tTest.pValue,
                tStatistic: tTest.tStatistic
            }
        };
    }
};

export { MathUtils };
