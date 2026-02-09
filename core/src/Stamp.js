import {v4 as uuidv4} from 'uuid';
import {BloomFilter} from './util/BloomFilter.js';
import {STAMP} from './config/constants.js';

export class Stamp {
    constructor() {
        if (this.constructor === Stamp) throw new Error("Abstract classes can't be instantiated.");
    }
}

/**
 * ArrayStamp implements explicit evidence tracking using a list of derivation IDs.
 * Acts as a vector clock/causality tracker to prevent circular reasoning.
 */
export class ArrayStamp extends Stamp {
    constructor({id = uuidv4(), creationTime = Date.now(), source = 'DERIVED', derivations = [], depth = 0} = {}) {
        super();
        this._id = id;
        this._creationTime = creationTime;
        this._source = source;
        this._derivations = Object.freeze([...new Set(derivations)]);
        // Cache derivations as Set for O(1) lookups
        this._derivationsSet = new Set(this._derivations);
        this._depth = depth;
        Object.freeze(this);
    }

    get id() { return this._id; }
    get creationTime() { return this._creationTime; }
    get source() { return this._source; }
    get derivations() { return this._derivations; }
    get depth() { return this._depth; }
    get occurrenceTime() { return this._creationTime; }

    equals(other) {
        return other instanceof ArrayStamp && this._id === other.id;
    }

    overlaps(other) {
        if (!other) return false;
        if (other instanceof BloomStamp) return other.overlaps(this);
        if (!(other instanceof ArrayStamp)) return false;

        if (this._id === other.id) return true;

        // Use cached Set for O(1) checks
        if (this._derivationsSet.has(other.id)) return true;

        // Check if other's derivations overlap with ours
        // We iterate over the smaller set if possible, but here we just iterate other
        // because we have this._derivationsSet ready.
        return other.derivations.some(d => d === this._id || this._derivationsSet.has(d));
    }

    toString() {
        return `Stamp(${this._id},${this._creationTime},${this._source})`;
    }
}

export class BloomStamp extends Stamp {
    constructor({id = uuidv4(), creationTime = Date.now(), source = 'DERIVED', depth = 0, filter = null} = {}) {
        super();
        this._id = id;
        this._creationTime = creationTime;
        this._source = source;
        this._depth = depth;
        this._filter = filter ?? new BloomFilter(STAMP.BLOOM_SIZE, STAMP.BLOOM_HASHES);
        this._filter.add(this._id);
        Object.freeze(this);
    }

    get id() { return this._id; }
    get creationTime() { return this._creationTime; }
    get source() { return this._source; }
    get depth() { return this._depth; }
    get occurrenceTime() { return this._creationTime; }
    get filter() { return this._filter; }
    get derivations() { return []; }

    equals(other) {
        return other instanceof BloomStamp && this._id === other.id;
    }

    overlaps(other) {
        if (!other) return false;
        if (other instanceof BloomStamp) return this._filter.intersects(other.filter);
        if (other instanceof ArrayStamp) {
            if (this._filter.test(other.id)) return true;
            return other.derivations.some(d => this._filter.test(d));
        }
        return false;
    }

    toString() {
        return `BloomStamp(${this._id},${this._creationTime},${this._source})`;
    }
}

// Static factory methods assigned after class definitions
Stamp.createInput = () => new ArrayStamp({source: 'INPUT', depth: 0});
Stamp.createBloomInput = () => new BloomStamp({source: 'INPUT', depth: 0});

Stamp.derive = (parentStamps = [], overrides = {}) => {
    if (parentStamps.some(s => s instanceof BloomStamp)) {
         return Stamp.deriveBloom(parentStamps, overrides);
    }

    const maxParentDepth = parentStamps.reduce((max, s) => Math.max(max, s.depth || 0), 0);

    // Phase 4.3: Bloom Filter Stamps - switch if depth exceeds threshold
    if (maxParentDepth > 20) {
        return Stamp.deriveBloom(parentStamps, overrides);
    }

    const allDerivations = new Set(parentStamps.flatMap(s => [s.id, ...(s.derivations || [])]));
    return new ArrayStamp({
        derivations: [...allDerivations],
        depth: maxParentDepth + 1,
        source: overrides.source || 'DERIVED'
    });
};

Stamp.deriveBloom = (parentStamps = [], overrides = {}) => {
    const maxParentDepth = parentStamps.reduce((max, s) => Math.max(max, s.depth || 0), 0);
    const newStamp = new BloomStamp({
        source: overrides.source || 'DERIVED',
        depth: maxParentDepth + 1
    });

    for (const parent of parentStamps) {
        if (parent instanceof BloomStamp) {
            newStamp.filter.merge(parent.filter);
        } else if (parent instanceof ArrayStamp) {
            newStamp.filter.add(parent.id);
            parent.derivations.forEach(d => newStamp.filter.add(d));
        }
    }

    return newStamp;
};
