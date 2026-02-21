/**
 * Statistical Tests for Hypothesis Testing
 * 
 * Provides common statistical tests for comparing agent performance
 * and determining significance of results.
 */

/**
 * Collection of statistical tests
 */
export class StatisticalTests {
    /**
     * Two-sample t-test
     */
    static tTest(sample1, sample2, alpha = 0.05) {
        const n1 = sample1.length;
        const n2 = sample2.length;

        if (n1 < 2 || n2 < 2) {
            return { 
                significant: false, 
                pValue: 1.0, 
                error: 'Sample sizes too small' 
            };
        }

        const mean1 = sample1.reduce((a, b) => a + b, 0) / n1;
        const mean2 = sample2.reduce((a, b) => a + b, 0) / n2;

        const var1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
        const var2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);

        // Pooled standard error
        const se = Math.sqrt(var1 / n1 + var2 / n2);

        if (se === 0) {
            return { 
                significant: false, 
                pValue: 1.0, 
                tStatistic: 0 
            };
        }

        const t = (mean1 - mean2) / se;
        const df = n1 + n2 - 2; // Degrees of freedom

        // Approximate p-value using normal distribution for large samples
        const pValue = 2 * (1 - StatisticalTests._normalCDF(Math.abs(t)));

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
     */
    static wilcoxonTest(sample1, sample2, alpha = 0.05) {
        if (sample1.length !== sample2.length) {
            return { 
                significant: false, 
                pValue: 1.0, 
                error: 'Samples must be paired' 
            };
        }

        const n = sample1.length;
        if (n < 5) {
            return { 
                significant: false, 
                pValue: 1.0, 
                error: 'Sample size too small for Wilcoxon' 
            };
        }

        // Calculate differences
        const differences = [];
        for (let i = 0; i < n; i++) {
            differences.push({
                diff: sample1[i] - sample2[i],
                absDiff: Math.abs(sample1[i] - sample2[i]),
                index: i
            });
        }

        // Remove zero differences
        const nonZero = differences.filter(d => d.diff !== 0);

        if (nonZero.length === 0) {
            return { significant: false, pValue: 1.0 };
        }

        // Rank by absolute difference
        nonZero.sort((a, b) => a.absDiff - b.absDiff);
        
        let rank = 1;
        for (let i = 0; i < nonZero.length; i++) {
            nonZero[i].rank = rank++;
        }

        // Sum of positive and negative ranks
        let wPlus = 0;
        let wMinus = 0;

        for (const d of nonZero) {
            if (d.diff > 0) {
                wPlus += d.rank;
            } else {
                wMinus += d.rank;
            }
        }

        const w = Math.min(wPlus, wMinus);
        const nNonZero = nonZero.length;

        // Normal approximation for large samples
        const mu = nNonZero * (nNonZero + 1) / 4;
        const sigma = Math.sqrt(nNonZero * (nNonZero + 1) * (2 * nNonZero + 1) / 24);

        const z = (w - mu) / sigma;
        const pValue = 2 * (1 - StatisticalTests._normalCDF(Math.abs(z)));

        return {
            significant: pValue < alpha,
            pValue,
            wStatistic: w,
            zScore: z
        };
    }

    /**
     * Permutation test (non-parametric)
     */
    static permutationTest(sample1, sample2, alpha = 0.05, permutations = 10000) {
        const n1 = sample1.length;
        const n2 = sample2.length;
        const combined = [...sample1, ...sample2];

        // Observed difference in means
        const obsDiff = StatisticalTests._mean(sample1) - StatisticalTests._mean(sample2);

        // Count extreme permutations
        let extreme = 0;

        for (let p = 0; p < permutations; p++) {
            // Shuffle combined data
            const shuffled = [...combined];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Split and compute difference
            const perm1 = shuffled.slice(0, n1);
            const perm2 = shuffled.slice(n1);

            const permDiff = StatisticalTests._mean(perm1) - StatisticalTests._mean(perm2);

            if (Math.abs(permDiff) >= Math.abs(obsDiff)) {
                extreme++;
            }
        }

        const pValue = extreme / permutations;

        return {
            significant: pValue < alpha,
            pValue,
            observedDifference: obsDiff,
            permutations
        };
    }

    /**
     * ANOVA test (compare multiple groups)
     */
    static anovaTest(...samples) {
        const k = samples.length; // Number of groups

        if (k < 2) {
            return { error: 'Need at least 2 groups' };
        }

        const nTotal = samples.reduce((sum, s) => sum + s.length, 0);
        const grandMean = samples.flat().reduce((a, b) => a + b, 0) / nTotal;

        // Between-group sum of squares
        let ssBetween = 0;
        for (const sample of samples) {
            const groupMean = sample.reduce((a, b) => a + b, 0) / sample.length;
            ssBetween += sample.length * Math.pow(groupMean - grandMean, 2);
        }

        // Within-group sum of squares
        let ssWithin = 0;
        for (const sample of samples) {
            const groupMean = sample.reduce((a, b) => a + b, 0) / sample.length;
            ssWithin += sample.reduce((sum, x) => sum + Math.pow(x - groupMean, 2), 0);
        }

        // Degrees of freedom
        const dfBetween = k - 1;
        const dfWithin = nTotal - k;

        // Mean squares
        const msBetween = ssBetween / dfBetween;
        const msWithin = ssWithin / dfWithin;

        // F-statistic
        const f = msBetween / msWithin;

        // Approximate p-value (using F-distribution approximation)
        const pValue = StatisticalTests._fDistributionPValue(f, dfBetween, dfWithin);

        return {
            significant: pValue < 0.05,
            pValue,
            fStatistic: f,
            dfBetween,
            dfWithin,
            ssBetween,
            ssWithin
        };
    }

    /**
     * Compute confidence interval for mean
     */
    static confidenceInterval(sample, confidence = 0.95) {
        const n = sample.length;
        const mean = sample.reduce((a, b) => a + b, 0) / n;
        
        const variance = sample.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
        const std = Math.sqrt(variance);
        const se = std / Math.sqrt(n);

        // Z-score for confidence level
        const z = confidence === 0.95 ? 1.96 : 
                  confidence === 0.99 ? 2.576 : 1.645;

        return {
            mean,
            std,
            lower: mean - z * se,
            upper: mean + z * se,
            confidence
        };
    }

    /**
     * Compute effect size (Cohen's d)
     */
    static cohensD(sample1, sample2) {
        const mean1 = sample1.reduce((a, b) => a + b, 0) / sample1.length;
        const mean2 = sample2.reduce((a, b) => a + b, 0) / sample2.length;

        const var1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (sample1.length - 1);
        const var2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (sample2.length - 1);

        const pooledStd = Math.sqrt((var1 + var2) / 2);

        if (pooledStd === 0) return 0;

        return (mean1 - mean2) / pooledStd;
    }

    /**
     * Bootstrap confidence interval
     */
    static bootstrapCI(sample, statistic = 'mean', confidence = 0.95, iterations = 10000) {
        const n = sample.length;
        const bootstrapStats = [];

        for (let i = 0; i < iterations; i++) {
            // Resample with replacement
            const resample = [];
            for (let j = 0; j < n; j++) {
                resample.push(sample[Math.floor(Math.random() * n)]);
            }

            // Compute statistic
            if (statistic === 'mean') {
                bootstrapStats.push(resample.reduce((a, b) => a + b, 0) / n);
            } else if (statistic === 'median') {
                const sorted = [...resample].sort((a, b) => a - b);
                bootstrapStats.push(sorted[Math.floor(n / 2)]);
            }
        }

        bootstrapStats.sort((a, b) => a - b);

        const lowerIdx = Math.floor((1 - confidence) / 2 * iterations);
        const upperIdx = Math.floor((1 + confidence) / 2 * iterations);

        return {
            lower: bootstrapStats[lowerIdx],
            upper: bootstrapStats[upperIdx],
            confidence,
            iterations
        };
    }

    // Helper functions

    static _mean(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Standard normal cumulative distribution function
     */
    static _normalCDF(x) {
        // Approximation using error function
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

        return x > 0 ? 1 - prob : prob;
    }

    /**
     * F-distribution p-value approximation
     */
    static _fDistributionPValue(f, df1, df2) {
        // Simplified approximation
        const x = df2 / (df2 + df1 * f);
        return Math.pow(x, df2 / 2);
    }
}

/**
 * Power analysis for experimental design
 */
export class PowerAnalysis {
    /**
     * Calculate required sample size for given power
     */
    static requiredSampleSize(effectSize = 0.5, power = 0.8, alpha = 0.05) {
        // Using approximation for two-sample t-test
        const zAlpha = alpha === 0.05 ? 1.96 : 2.576; // Two-tailed
        const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 1.64;

        const n = 2 * Math.pow((zAlpha + zBeta) / effectSize, 2);

        return Math.ceil(n);
    }

    /**
     * Calculate power for given sample size
     */
    static calculatePower(effectSize, n, alpha = 0.05) {
        const zAlpha = alpha === 0.05 ? 1.96 : 2.576;

        const zBeta = effectSize * Math.sqrt(n / 2) - zAlpha;
        
        // Convert z-score to power using normal CDF
        return StatisticalTests._normalCDF(zBeta);
    }

    /**
     * Calculate detectable effect size
     */
    static detectableEffectSize(n, power = 0.8, alpha = 0.05) {
        const zAlpha = alpha === 0.05 ? 1.96 : 2.576;
        const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 1.64;

        return (zAlpha + zBeta) * Math.sqrt(2 / n);
    }
}

/**
 * Multiple comparison corrections
 */
export class MultipleComparisonCorrection {
    /**
     * Bonferroni correction
     */
    static bonferroni(pValues, alpha = 0.05) {
        const m = pValues.length;
        const correctedAlpha = alpha / m;

        return {
            correctedAlpha,
            significant: pValues.map(p => p < correctedAlpha),
            adjustedPValues: pValues.map(p => Math.min(p * m, 1))
        };
    }

    /**
     * Holm-Bonferroni correction (step-down)
     */
    static holmBonferroni(pValues, alpha = 0.05) {
        const m = pValues.length;
        
        // Sort p-values with original indices
        const sorted = pValues
            .map((p, i) => ({ p, i }))
            .sort((a, b) => a.p - b.p);

        const adjusted = new Array(m);
        let prevAdjusted = 0;

        for (let k = 0; k < m; k++) {
            const adjustedP = Math.max((m - k) * sorted[k].p, prevAdjusted);
            adjusted[sorted[k].i] = Math.min(adjustedP, 1);
            prevAdjusted = adjustedP;
        }

        return {
            correctedAlpha: alpha,
            significant: adjusted.map(p => p < alpha),
            adjustedPValues: adjusted
        };
    }

    /**
     * Benjamini-Hochberg correction (FDR control)
     */
    static benjaminiHochberg(pValues, alpha = 0.05) {
        const m = pValues.length;

        // Sort p-values with original indices
        const sorted = pValues
            .map((p, i) => ({ p, i }))
            .sort((a, b) => b.p - a.p); // Descending

        const adjusted = new Array(m);
        let prevAdjusted = 1;

        for (let k = 0; k < m; k++) {
            const rank = m - k;
            const adjustedP = Math.min((m / rank) * sorted[k].p, prevAdjusted);
            adjusted[sorted[k].i] = adjustedP;
            prevAdjusted = adjustedP;
        }

        return {
            fdrLevel: alpha,
            significant: adjusted.map(p => p < alpha),
            adjustedPValues: adjusted
        };
    }
}
