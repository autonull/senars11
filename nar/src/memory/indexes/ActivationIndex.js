import {BaseIndex} from './BaseIndex.js';
import {getWithDefaultSet} from '../MemoryUtils.js';

export class ActivationIndex extends BaseIndex {
    constructor(config = {}) {
        super(config);
        this._index = new Map(); // Maps activation buckets to concepts
    }

    add(concept) {
        const activationBucket = this._getActivationBucket(concept.activation);
        const concepts = getWithDefaultSet(this._index, activationBucket);
        concepts.add(concept);
    }

    remove(concept) {
        const activationBucket = this._getActivationBucket(concept.activation);
        if (this._index.has(activationBucket)) {
            const concepts = this._index.get(activationBucket);
            concepts.delete(concept);
            if (concepts.size === 0) {
                this._index.delete(activationBucket);
            }
        }
    }

    _getActivationBucket(activation) {
        // Simplified activation bucketing - would need full config implementation
        activation = activation || 0;
        // Create buckets of size 0.1
        return Math.floor(activation * 10) / 10;
    }

    find(filters = {}) {
        const {minActivation, maxActivation} = filters;

        return (minActivation !== undefined || maxActivation !== undefined)
            ? this._getConceptsByActivationRange(minActivation, maxActivation)
            : this.getAll();
    }

    _getConceptsByActivationRange(minActivation, maxActivation) {
        const result = [];
        for (const [bucket, concepts] of this._index.entries()) {
            const bucketValue = parseFloat(bucket);
            if ((minActivation === undefined || bucketValue >= minActivation) &&
                (maxActivation === undefined || bucketValue <= maxActivation)) {
                result.push(...Array.from(concepts));
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