export class TemporalQueries {
    constructor() {
    }

    getConceptsByTimePeriod(period, getAllConcepts) {
        const now = Date.now();
        const periodMappings = {
            'hour': 3600000,
            'day': 86400000,
            'week': 604800000,
            'month': 2592000000
        };

        const periodMs = periodMappings[period] || periodMappings['day'];
        const periodCount = 10;
        const periods = {};

        for (let i = 0; i < periodCount; i++) {
            const periodStart = now - (i * periodMs);
            periods[i] = {
                start: periodStart,
                end: periodStart + periodMs,
                concepts: [],
                count: 0
            };
        }

        for (const concept of getAllConcepts()) {
            const createdAt = concept.createdAt || 0;
            if (createdAt <= 0) {
                continue;
            }
            const periodIndex = Math.floor((now - createdAt) / periodMs);
            if (periodIndex >= 0 && periodIndex < periodCount) {
                const p = periods[periodIndex];
                p.concepts.push(concept);
                p.count++;
            }
        }
        return periods;
    }
}
