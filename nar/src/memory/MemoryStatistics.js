import {Statistics} from '@senars/core/src/util/Statistics.js';

export class MemoryStatistics {
    static getDetailedStats(memory, stats) {
        const conceptStats = memory.getAllConcepts().map(c => c.getStats());
        const hasConcepts = conceptStats.length > 0;
        const calculatedStats = hasConcepts ? this._calculateConceptStatistics(conceptStats) : this._getDefaultStats();

        const timestamps = hasConcepts ? conceptStats.map(s => s.createdAt) : [];

        return {
            ...stats,
            conceptStats,
            memoryUsage: {
                concepts: memory.concepts.size,
                focusConcepts: memory.focusConcepts.size,
                totalTasks: stats.totalTasks
            },
            // Note: We assume memory has _index exposed or we pass it in. 
            // Memory.js exposes _index via getStats usually, but here we are inside Memory.js logic effectively.
            // We'll assume the caller handles indexStats or we pass index as arg if needed.
            // For now, let's keep it simple and let Memory.js attach indexStats.
            oldestConcept: hasConcepts ? Math.min(...timestamps) : null,
            newestConcept: hasConcepts ? Math.max(...timestamps) : null,
            ...calculatedStats,
            conceptCount: hasConcepts ? conceptStats.length : 0
        };
    }

    static _getDefaultStats() {
        return {
            averageActivation: 0,
            averageQuality: 0,
            activationStd: 0,
            qualityStd: 0,
            activationMedian: 0,
            qualityMedian: 0
        };
    }

    static _calculateConceptStatistics(conceptStats) {
        const activations = conceptStats.map(s => s.activation);
        const qualities = conceptStats.map(s => s.quality);

        return {
            averageActivation: Statistics.mean(activations),
            averageQuality: Statistics.mean(qualities),
            activationStd: Statistics.stdDev(activations),
            qualityStd: Statistics.stdDev(qualities),
            activationMedian: Statistics.median(activations),
            qualityMedian: Statistics.median(qualities)
        };
    }
}
