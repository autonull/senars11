import {v4 as uuidv4} from 'uuid';
import {BloomFilter} from './util/BloomFilter.js';
import {STAMP} from './config/constants.js';

export class Stamp {
    constructor() {
        if (this.constructor === Stamp) throw new Error("Abstract classes can't be instantiated.");
    }

    static createInput = () => new ArrayStamp({source: 'INPUT', depth: 0});

    static createBloomInput = () => new BloomStamp({source: 'INPUT', depth: 0});

    static derive = (parentStamps = [], overrides = {}) => {
        // If any parent is a BloomStamp, result is BloomStamp
        if (parentStamps.some(s => s instanceof BloomStamp)) {
             return Stamp.deriveBloom(parentStamps, overrides);
        }

        const maxParentDepth = parentStamps.length > 0 ? Math.max(...parentStamps.map(s => s.depth || 0)) : 0;

        // Phase 4.3: Bloom Filter Stamps
        // Automatically switch to Bloom Filter if depth exceeds threshold to save space
        const BLOOM_TRANSITION_THRESHOLD = 20;
        if (maxParentDepth > BLOOM_TRANSITION_THRESHOLD) {
            return Stamp.deriveBloom(parentStamps, overrides);
        }

        const allDerivations = parentStamps.flatMap(s => s.derivations ? [s.id, ...s.derivations] : [s.id]);
        return new ArrayStamp({
            derivations: [...new Set(allDerivations)],
            depth: maxParentDepth + 1,
            source: overrides.source || 'DERIVED'
        });
    };

    static deriveBloom = (parentStamps = [], overrides = {}) => {
        const maxParentDepth = parentStamps.length > 0 ? Math.max(...parentStamps.map(s => s.depth || 0)) : 0;
        const newStamp = new BloomStamp({
            source: overrides.source || 'DERIVED',
            depth: maxParentDepth + 1
        });

        // Merge parent filters
        for (const parent of parentStamps) {
            if (parent instanceof BloomStamp) {
                newStamp.filter.merge(parent.filter);
            } else if (parent instanceof ArrayStamp) {
                // Convert ArrayStamp derivations to bloom
                newStamp.filter.add(parent.id);
                parent.derivations.forEach(d => newStamp.filter.add(d));
            }
        }

        return newStamp;
    };
}

/**
 * ArrayStamp implements explicit evidence tracking using a list of derivation IDs.
 * This effectively acts as a vector clock/causality tracker to prevent circular reasoning.
 * If two stamps share any derivation ID (overlap), the inference is rejected.
 */
export class ArrayStamp extends Stamp {
    constructor({id = uuidv4(), creationTime = Date.now(), source = 'DERIVED', derivations = [], depth = 0} = {}) {
        super();
        this._id = id;
        this._creationTime = creationTime;
        this._source = source;
        this._derivations = Object.freeze([...new Set(derivations)]);
        this._depth = depth;
        Object.freeze(this);
    }

    get id() {
        return this._id;
    }

    get creationTime() {
        return this._creationTime;
    }

    get source() {
        return this._source;
    }

    get derivations() {
        return this._derivations;
    }

    get depth() {
        return this._depth;
    }

    get occurrenceTime() {
        return this._creationTime;
    }

    equals(other) {
        return other instanceof ArrayStamp && this._id === other.id;
    }

    overlaps(other) {
        if (!other) return false;

        // If other is BloomStamp, let it handle the check
        if (other instanceof BloomStamp) {
            return other.overlaps(this);
        }

        // If other is ArrayStamp, check for common derivations
        if (other instanceof ArrayStamp) {
            // Check if IDs match (self overlap)
            if (this._id === other.id) return true;

            // Check direct derivation overlap
            // Optimization: check if smaller set is in larger set
            // But for now simple iteration
            const thisDerivations = new Set(this._derivations);
            if (thisDerivations.has(other.id)) return true;

            for (const d of other.derivations) {
                if (this._id === d || thisDerivations.has(d)) return true;
            }
            return false;
        }

        return false;
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

        if (filter) {
            this._filter = filter;
        } else {
            this._filter = new BloomFilter(STAMP.BLOOM_SIZE, STAMP.BLOOM_HASHES);
        }

        // Always add self to the filter
        this._filter.add(this._id);

        Object.freeze(this);
    }

    get id() { return this._id; }
    get creationTime() { return this._creationTime; }
    get source() { return this._source; }
    get depth() { return this._depth; }
    get occurrenceTime() { return this._creationTime; }

    get filter() { return this._filter; }

    // BloomStamp cannot return exact derivation list
    get derivations() { return []; }

    equals(other) {
        return other instanceof BloomStamp && this._id === other.id;
    }

    overlaps(other) {
        if (!other) return false;
        if (other instanceof BloomStamp) {
            return this._filter.intersects(other.filter);
        }
        // If other is ArrayStamp, checking overlap is tricky because we only have bloom filter.
        // We can check if any of other's derivations are in our filter.
        if (other instanceof ArrayStamp) {
            if (this._filter.test(other.id)) return true;
            for (const d of other.derivations) {
                if (this._filter.test(d)) return true;
            }
            return false;
        }
        return false;
    }

    toString() {
        return `BloomStamp(${this._id},${this._creationTime},${this._source})`;
    }
}
