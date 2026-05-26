import {BaseIndex} from './BaseIndex.js';

export class TemporalIndex extends BaseIndex {
    constructor(config = {}) {
        super(config);
        this._index = new Map(); // Maps temporal buckets to concepts
    }

    add(concept) {
        const timestamp = concept.createdAt || Date.now();
        const temporalBucket = this._getTemporalBucket(timestamp);
        const concepts = this._index.get(temporalBucket) || new Set();
        concepts.add(concept);
        this._index.set(temporalBucket, concepts);
    }

    remove(concept) {
        const timestamp = concept.createdAt || Date.now();
        const temporalBucket = this._getTemporalBucket(timestamp);
        if (this._index.has(temporalBucket)) {
            const concepts = this._index.get(temporalBucket);
            concepts.delete(concept);
            if (concepts.size === 0) {
                this._index.delete(temporalBucket);
            }
        }
    }

    _getTemporalBucket(timestamp) {
        // Simplified temporal bucketing - group by hour (could be configurable)
        const bucketSize = 60 * 60 * 1000; // 1 hour in milliseconds
        return Math.floor(timestamp / bucketSize) * bucketSize;
    }

    find(filters = {}) {
        const {createdAfter, createdBefore} = filters;

        return (createdAfter !== undefined || createdBefore !== undefined)
            ? this._getConceptsByTimeRange(createdAfter, createdBefore)
            : this.getAll();
    }

    _getConceptsByTimeRange(createdAfter, createdBefore) {
        const result = [];
        for (const [bucket, concepts] of this._index.entries()) {
            const bucketStartTime = parseInt(bucket);
            const bucketEndTime = bucketStartTime + (60 * 60 * 1000); // 1 hour window

            // Check if bucket overlaps with requested time range
            const bucketOverlaps = (createdBefore === undefined || bucketStartTime <= createdBefore) &&
                (createdAfter === undefined || bucketEndTime >= createdAfter);

            if (bucketOverlaps) {
                // Additional filtering might be needed inside bucket
                for (const concept of concepts) {
                    const conceptTime = concept.createdAt || Date.now();
                    if ((createdAfter === undefined || conceptTime >= createdAfter) &&
                        (createdBefore === undefined || conceptTime <= createdBefore)) {
                        result.push(concept);
                    }
                }
            }
        }
        return result;
    }

    clear() {
        this._index.clear();
    }

    getAll() {
        const allConcepts = new Set();
        for (const concepts of this._index.values()) {
            for (const concept of concepts) {
                allConcepts.add(concept);
            }
        }
        return Array.from(allConcepts);
    }
}