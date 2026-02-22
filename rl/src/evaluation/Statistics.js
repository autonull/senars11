const MathUtils = {
    mean(arr) {
        return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    variance(arr, mean) {
        const m = mean ?? this.mean(arr);
        return arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
    },

    std(arr, mean) {
        return Math.sqrt(this.variance(arr, mean));
    },

    normalCDF(x) {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - prob : prob;
    },

    fDistributionPValue(f, df1, df2) {
        const x = df2 / (df2 + df1 * f);
        return Math.pow(x, df2 / 2);
    }
};

export class StatisticalTests {
    static tTest(sample1, sample2, alpha = 0.05) {
        const n1 = sample1.length;
        const n2 = sample2.length;

        if (n1 < 2 || n2 < 2) return { significant: false, pValue: 1.0, error: 'Sample sizes too small' };

        const mean1 = MathUtils.mean(sample1);
        const mean2 = MathUtils.mean(sample2);
        const var1 = MathUtils.variance(sample1, mean1);
        const var2 = MathUtils.variance(sample2, mean2);

        const se = Math.sqrt(var1 / n1 + var2 / n2);
        if (se === 0) return { significant: false, pValue: 1.0, tStatistic: 0 };

        const t = (mean1 - mean2) / se;
        const pValue = 2 * (1 - MathUtils.normalCDF(Math.abs(t)));

        return {
            significant: pValue < alpha,
            pValue,
            tStatistic: t,
            degreesOfFreedom: n1 + n2 - 2,
            mean1,
            mean2,
            effectSize: (mean1 - mean2) / Math.sqrt((var1 + var2) / 2)
        };
    }

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

    static permutationTest(sample1, sample2, alpha = 0.05, permutations = 10000) {
        const n1 = sample1.length;
        const n2 = sample2.length;
        const combined = [...sample1, ...sample2];
        const obsDiff = MathUtils.mean(sample1) - MathUtils.mean(sample2);

        let extreme = 0;
        for (let p = 0; p < permutations; p++) {
            const shuffled = [...combined];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            const perm1 = shuffled.slice(0, n1);
            const perm2 = shuffled.slice(n1);
            const permDiff = MathUtils.mean(perm1) - MathUtils.mean(perm2);

            if (Math.abs(permDiff) >= Math.abs(obsDiff)) extreme++;
        }

        return { significant: extreme / permutations < alpha, pValue: extreme / permutations, observedDifference: obsDiff, permutations };
    }

    static anovaTest(...samples) {
        const k = samples.length;
        if (k < 2) return { error: 'Need at least 2 groups' };

        const nTotal = samples.reduce((sum, s) => sum + s.length, 0);
        const grandMean = MathUtils.mean(samples.flat());

        let ssBetween = 0, ssWithin = 0;
        samples.forEach(sample => {
            const groupMean = MathUtils.mean(sample);
            ssBetween += sample.length * Math.pow(groupMean - grandMean, 2);
            ssWithin += sample.reduce((sum, x) => sum + Math.pow(x - groupMean, 2), 0);
        });

        const dfBetween = k - 1;
        const dfWithin = nTotal - k;
        const f = (ssBetween / dfBetween) / (ssWithin / dfWithin);
        const pValue = MathUtils.fDistributionPValue(f, dfBetween, dfWithin);

        return { significant: pValue < 0.05, pValue, fStatistic: f, dfBetween, dfWithin, ssBetween, ssWithin };
    }

    static confidenceInterval(sample, confidence = 0.95) {
        const n = sample.length;
        const mean = MathUtils.mean(sample);
        const std = MathUtils.std(sample, mean);
        const se = std / Math.sqrt(n);
        const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.645;

        return { mean, std, lower: mean - z * se, upper: mean + z * se, confidence };
    }

    static cohensD(sample1, sample2) {
        const mean1 = MathUtils.mean(sample1);
        const mean2 = MathUtils.mean(sample2);
        const var1 = MathUtils.variance(sample1, mean1);
        const var2 = MathUtils.variance(sample2, mean2);
        const pooledStd = Math.sqrt((var1 + var2) / 2);
        return pooledStd === 0 ? 0 : (mean1 - mean2) / pooledStd;
    }

    static bootstrapCI(sample, statistic = 'mean', confidence = 0.95, iterations = 10000) {
        const n = sample.length;
        const bootstrapStats = Array.from({ length: iterations }, () => {
            const resample = Array.from({ length: n }, () => sample[Math.floor(Math.random() * n)]);
            return statistic === 'mean'
                ? MathUtils.mean(resample)
                : [...resample].sort((a, b) => a - b)[Math.floor(n / 2)];
        });

        bootstrapStats.sort((a, b) => a - b);
        const lowerIdx = Math.floor((1 - confidence) / 2 * iterations);
        const upperIdx = Math.floor((1 + confidence) / 2 * iterations);

        return { lower: bootstrapStats[lowerIdx], upper: bootstrapStats[upperIdx], confidence, iterations };
    }
}

export class PowerAnalysis {
    static requiredSampleSize(effectSize = 0.5, power = 0.8, alpha = 0.05) {
        const zAlpha = alpha === 0.05 ? 1.96 : 2.576;
        const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 1.64;
        return Math.ceil(2 * Math.pow((zAlpha + zBeta) / effectSize, 2));
    }

    static calculatePower(effectSize, n, alpha = 0.05) {
        const zAlpha = alpha === 0.05 ? 1.96 : 2.576;
        const zBeta = effectSize * Math.sqrt(n / 2) - zAlpha;
        return MathUtils.normalCDF(zBeta);
    }

    static detectableEffectSize(n, power = 0.8, alpha = 0.05) {
        const zAlpha = alpha === 0.05 ? 1.96 : 2.576;
        const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 1.64;
        return (zAlpha + zBeta) * Math.sqrt(2 / n);
    }
}

export class MultipleComparisonCorrection {
    static bonferroni(pValues, alpha = 0.05) {
        const m = pValues.length;
        return {
            correctedAlpha: alpha / m,
            significant: pValues.map(p => p < alpha / m),
            adjustedPValues: pValues.map(p => Math.min(p * m, 1))
        };
    }

    static holmBonferroni(pValues, alpha = 0.05) {
        const m = pValues.length;
        const sorted = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
        const adjusted = new Array(m);
        let prevAdjusted = 0;

        for (let k = 0; k < m; k++) {
            const adjustedP = Math.max((m - k) * sorted[k].p, prevAdjusted);
            adjusted[sorted[k].i] = Math.min(adjustedP, 1);
            prevAdjusted = adjustedP;
        }

        return { correctedAlpha: alpha, significant: adjusted.map(p => p < alpha), adjustedPValues: adjusted };
    }

    static benjaminiHochberg(pValues, alpha = 0.05) {
        const m = pValues.length;
        const sorted = pValues.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
        const adjusted = new Array(m);
        let prevAdjusted = 1;

        for (let k = 0; k < m; k++) {
            const rank = m - k;
            const adjustedP = Math.min((m / rank) * sorted[k].p, prevAdjusted);
            adjusted[sorted[k].i] = adjustedP;
            prevAdjusted = adjustedP;
        }

        return { fdrLevel: alpha, significant: adjusted.map(p => p < alpha), adjustedPValues: adjusted };
    }
}

export class AgentComparator {
    constructor(config = {}) {
        this.config = {
            significanceLevel: config.significanceLevel ?? 0.05,
            testType: config.testType ?? 't-test'
        };
    }

    async compare(agent1, agent2, environments, options = {}) {
        const { numEpisodes = 50 } = options;
        const results1 = await this._benchmarkAgent(agent1, environments, numEpisodes);
        const results2 = await this._benchmarkAgent(agent2, environments, numEpisodes);
        return this._statisticalComparison(results1, results2);
    }

    async _benchmarkAgent(agent, environments, numEpisodes) {
        return Promise.all(environments.map(async env => {
            const rewards = await Promise.all(
                Array.from({ length: numEpisodes }, () => this._runEpisode(agent, env))
                    .map(async ep => {
                        const { reward } = await ep;
                        return reward;
                    })
            );
            return { environment: env.name ?? 'unknown', rewards };
        }));
    }

    async _runEpisode(agent, env) {
        const { observation: obs } = env.reset();
        let observation = obs;
        let totalReward = 0;

        for (let step = 0; step < 200; step++) {
            const action = await agent.act(observation);
            const result = env.step(action);
            observation = result.observation;
            totalReward += result.reward;
            if (result.terminated) break;
        }

        return { observation, reward: totalReward };
    }

    _statisticalComparison(results1, results2) {
        const comparisons = results1.map((r1, i) => {
            const r2 = results2[i];
            const test = this._performTest(r1.rewards, r2.rewards);
            return {
                environment: r1.environment,
                agent1Mean: MathUtils.mean(r1.rewards),
                agent2Mean: MathUtils.mean(r2.rewards),
                agent1Std: MathUtils.std(r1.rewards),
                agent2Std: MathUtils.std(r2.rewards),
                ...test
            };
        });

        const significantWins = {
            agent1: comparisons.filter(c => c.significant && c.agent1Mean > c.agent2Mean).length,
            agent2: comparisons.filter(c => c.significant && c.agent2Mean > c.agent1Mean).length
        };

        return {
            comparisons,
            summary: {
                agent1Wins: significantWins.agent1,
                agent2Wins: significantWins.agent2,
                totalEnvironments: comparisons.length,
                winner: significantWins.agent1 > significantWins.agent2 ? 'agent1'
                    : significantWins.agent2 > significantWins.agent1 ? 'agent2'
                    : 'tie'
            }
        };
    }

    _performTest(sample1, sample2) {
        return StatisticalTests.tTest(sample1, sample2, this.config.significanceLevel);
    }
}
