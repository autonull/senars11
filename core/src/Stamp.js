import {v4 as uuidv4} from 'uuid';

export class Stamp {
    constructor() {
        if (this.constructor === Stamp) throw new Error("Abstract classes can't be instantiated.");
    }

    static createInput = () => new ArrayStamp({source: 'INPUT', depth: 0});
    static derive = (parentStamps = [], depth = 0) => {
        const allDerivations = parentStamps.flatMap(s => s.derivations ? [s.id, ...s.derivations] : [s.id]);
        const maxParentDepth = parentStamps.length > 0 ? Math.max(...parentStamps.map(s => s.depth || 0)) : 0;
        return new ArrayStamp({derivations: [...new Set(allDerivations)], depth: maxParentDepth + 1});
    };
}

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

    toString() {
        return `Stamp(${this._id},${this._creationTime},${this._source})`;
    }
}

export class BloomStamp extends Stamp {
    constructor() {
        super();
        throw new Error("BloomStamp is not yet implemented.");
    }
}