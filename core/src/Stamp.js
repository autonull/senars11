import {v4 as uuidv4} from 'uuid';
import {BloomFilter} from './util/BloomFilter.js';
import {STAMP} from './config/constants.js';

/**
 * Abstract Stamp class for evidence tracking.
 */
export class Stamp {
    constructor() {
        if (this.constructor === Stamp) throw new Error("Abstract classes can't be instantiated.");
    }

    static createInput() {
        return new ArrayStamp({source: 'INPUT', depth: 0});
    }

    static createBloomInput() {
        return new BloomStamp({source: 'INPUT', depth: 0});
    }

    static derive(parentStamps = [], overrides = {}) {
        // Optimization: avoid reduce/some if empty or single
        if (parentStamps.length === 0) return Stamp.createInput();

        let maxParentDepth = 0;
        let hasBloom = false;

        for (const s of parentStamps) {
            const d = s.depth || 0;
            if (d > maxParentDepth) maxParentDepth = d;
            if (s instanceof BloomStamp) hasBloom = true;
        }

        // Phase 4.3: Bloom Filter Stamps - switch if depth exceeds threshold or if any parent is Bloom
        if (hasBloom || maxParentDepth > 20) {
            return Stamp._deriveBloom(parentStamps, maxParentDepth, overrides);
        }

        return Stamp._deriveArray(parentStamps, maxParentDepth, overrides);
    }

    static _deriveArray(parentStamps, maxParentDepth, overrides) {
        const derivationSet = new Set();
        for (const s of parentStamps) {
            derivationSet.add(s.id);
            if (s.derivations) {
                for (const d of s.derivations) derivationSet.add(d);
            }
        }

        return new ArrayStamp({
            derivations: [...derivationSet],
            depth: maxParentDepth + 1,
            source: overrides.source || 'DERIVED'
        });
    }

    static _deriveBloom(parentStamps, maxParentDepth, overrides) {
        const newStamp = new BloomStamp({
            source: overrides.source || 'DERIVED',
            depth: maxParentDepth + 1
        });

        for (const parent of parentStamps) {
            if (parent instanceof BloomStamp) {
                newStamp.filter.merge(parent.filter);
            } else if (parent instanceof ArrayStamp) {
                newStamp.filter.add(parent.id);
                for (const d of parent.derivations) {
                    newStamp.filter.add(d);
                }
            }
        }

        return newStamp;
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
        // Ensure uniqueness and immutability
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
        if (other === this) return true;

        if (other instanceof BloomStamp) return other.overlaps(this);
        if (!(other instanceof ArrayStamp)) return false;

        if (this._id === other.id) return true;

        // Direct derivation check (O(1))
        if (this._derivationsSet.has(other.id)) return true;
        if (other._derivationsSet.has(this._id)) return true;

        // Intersection check: iterate over smaller set (O(min(N, M)))
        const [smaller, largerSet] = this._derivations.length < other.derivations.length
            ? [this._derivations, other._derivationsSet]
            : [other.derivations, this._derivationsSet];

        for (const d of smaller) {
            if (largerSet.has(d)) return true;
        }

        return false;
    }

    clone(overrides = {}) {
        return new ArrayStamp({
            id: overrides.id ?? this._id,
            creationTime: overrides.creationTime ?? this._creationTime,
            source: overrides.source ?? this._source,
            derivations: overrides.derivations ?? this._derivations,
            depth: overrides.depth ?? this._depth
        });
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
        if (other === this) return true;

        if (other instanceof BloomStamp) return this._filter.intersects(other.filter);
        if (other instanceof ArrayStamp) {
            if (this._filter.test(other.id)) return true;
            // Check if any derivation in ArrayStamp is in BloomFilter
            for (const d of other.derivations) {
                if (this._filter.test(d)) return true;
            }
            return false;
        }
        return false;
    }

    clone(overrides = {}) {
        return new BloomStamp({
            id: overrides.id ?? this._id,
            creationTime: overrides.creationTime ?? this._creationTime,
            source: overrides.source ?? this._source,
            depth: overrides.depth ?? this._depth,
            filter: overrides.filter ?? (this._filter ? this._filter.clone() : null)
        });
    }

    toString() {
        return `BloomStamp(${this._id},${this._creationTime},${this._source})`;
    }
}
