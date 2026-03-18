import {v4 as uuidv4} from 'uuid';
import {BloomFilter} from './util/BloomFilter.js';
import {STAMP} from './config/constants.js';

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
        const maxDepth = Stamp._getMaxDepth(parentStamps);
        const useBloom = maxDepth > 20 || parentStamps.some(s => s instanceof BloomStamp);

        if (useBloom) {
            return Stamp.deriveBloom(parentStamps, overrides, maxDepth);
        }

        const allDerivations = parentStamps.flatMap(s => [s.id, ...(s.derivations || [])]);
        return new ArrayStamp({
            derivations: allDerivations,
            depth: maxDepth + 1,
            source: overrides.source || 'DERIVED'
        });
    }

    static deriveBloom(parentStamps = [], overrides = {}, maxDepth = null) {
        const depth = (maxDepth ?? Stamp._getMaxDepth(parentStamps)) + 1;
        const newStamp = new BloomStamp({
            source: overrides.source || 'DERIVED',
            depth
        });

        const filter = newStamp.filter;
        for (const parent of parentStamps) {
            if (parent instanceof BloomStamp) {
                filter.merge(parent.filter);
            } else if (parent instanceof ArrayStamp) {
                filter.add(parent.id);
                for (const d of parent.derivations) {
                    filter.add(d);
                }
            }
        }

        return newStamp;
    }

    static _getMaxDepth(stamps) {
        return stamps.reduce((max, s) => Math.max(max, s.depth || 0), 0);
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
        this._derivationsSet = new Set(derivations);
        this._derivations = Object.freeze(Array.from(this._derivationsSet));
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

        if (this._id === other.id || this._derivationsSet.has(other.id) || other._derivationsSet.has(this._id)) return true;

        const [smaller, larger] = this._derivations.length < other._derivations.length ? [this, other] : [other, this];
        return smaller.derivations.some(d => larger._derivationsSet.has(d));
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
        if (other instanceof BloomStamp) return this._filter.intersects(other.filter);
        if (other instanceof ArrayStamp) {
            if (this._filter.test(other.id)) return true;
            // Use iterator to avoid array allocation if possible, but ArrayStamp has array.
            // .some() is good.
            return other.derivations.some(d => this._filter.test(d));
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
