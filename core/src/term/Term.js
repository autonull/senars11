const freeze = Object.freeze;

export const TermType = freeze({
    ATOM: 'atom',
    COMPOUND: 'compound',
});

export const SemanticType = freeze({
    BOOLEAN: 'boolean',
    NUMERIC: 'numeric',
    VARIABLE: 'variable',
    NAL_CONCEPT: 'nal_concept',
    UNKNOWN: 'unknown'
});

/**
 * Term represents a Narsese term (Atomic or Compound).
 * Immutable.
 */
export class Term {
    constructor(type, name, components = [], operator = null) {
        this._type = type;
        this._name = name;
        this._operator = operator;
        // Ensure components are frozen and immutable array
        this._components = freeze(type === TermType.ATOM && !components.length ? [name] : components);

        this._complexity = this._calculateComplexity();
        this._id = name;
        this._hash = Term.hash(this._id);
        this._semanticType = this._determineSemanticType();
        this._typeTag = this._calculateTypeTag();

        freeze(this);
    }

    get type() { return this._type; }
    get name() { return this._name; }
    get operator() { return this._operator; }
    get components() { return this._components; }
    get subject() { return this._components[0]; }
    get predicate() { return this._components[1]; }

    get isInheritance() { return this._operator === '-->'; }
    get isImplication() { return this._operator === '==>'; }
    get isSimilarity() { return this._operator === '<->'; }
    get isEquivalence() { return this._operator === '<=>'; }

    get complexity() { return this._complexity; }
    get hash() { return this._hash; }
    get id() { return this._id; }
    get semanticType() { return this._semanticType; }

    get isAtomic() { return this._type === TermType.ATOM; }
    get isCompound() { return this._type === TermType.COMPOUND; }
    get isBoolean() { return this._semanticType === SemanticType.BOOLEAN; }
    get isNumeric() { return this._semanticType === SemanticType.NUMERIC; }
    get isVariable() { return this._semanticType === SemanticType.VARIABLE; }
    get isNALConcept() { return this._semanticType === SemanticType.NAL_CONCEPT; }

    // FNV-1a hash implementation
    static hash(str) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
    }

    static fromJSON(data) {
        if (!data) throw new Error('Term.fromJSON requires valid data object');
        const { type, name, components = [], operator } = data;
        return new Term(type, name, components, operator);
    }

    comp(index) { return this._components[index]; }
    compName(index) { return this._components[index]?.name; }
    compEquals(index, term) { return !!this._components[index]?.equals?.(term); }
    isOp(op) { return this._operator === op; }
    subjectEquals(term) { return this.compEquals(0, term); }
    predicateEquals(term) { return this.compEquals(1, term); }

    _determineSemanticType() {
        if (this._type !== TermType.ATOM) return SemanticType.NAL_CONCEPT;

        // Optimized check order
        if (this._name.length > 0) {
            const firstChar = this._name[0];
            if (firstChar === '?') return SemanticType.VARIABLE;
            if (this._name === 'True' || this._name === 'False' || this._name === 'Null') return SemanticType.BOOLEAN;
            if (!isNaN(Number(this._name))) return SemanticType.NUMERIC;
        }
        return SemanticType.NAL_CONCEPT;
    }

    _calculateTypeTag() {
        if (this._type === TermType.COMPOUND) return 3;
        if (this._name.length > 0 && (this._name[0] === '?' || this._name[0] === '$')) return 2;
        return 1;
    }

    _calculateComplexity() {
        if (this._type === TermType.ATOM) return 1;
        // Reduce overhead: loop instead of reduce for large compounds
        let sum = 1;
        for (const c of this._components) {
            sum += c?.complexity ?? 0;
        }
        return sum;
    }

    equals(other) {
        if (this === other) return true;
        if (!(other instanceof Term)) return false;

        // Fail fast checks
        if (this._hash !== other._hash) return false;
        if (this._type !== other._type) return false;
        if (this._operator !== other._operator) return false;
        if (this._name !== other._name) return false;

        // If simple properties match, verify deep structure for compounds
        if (this._type === TermType.COMPOUND) {
            const len = this._components.length;
            if (len !== other._components.length) return false;
            for (let i = 0; i < len; i++) {
                if (!this._components[i].equals(other._components[i])) return false;
            }
        }
        return true;
    }

    toString() { return this._name; }

    visit(visitor, order = 'pre-order') {
        if (order === 'pre-order') visitor(this);
        for (const c of this._components) {
            if (c instanceof Term) c.visit(visitor, order);
        }
        if (order === 'post-order') visitor(this);
    }

    reduce(fn, acc) {
        let result = fn(acc, this);
        for (const c of this._components) {
            if (c instanceof Term) result = c.reduce(fn, result);
        }
        return result;
    }

    serialize() {
        return {
            type: this._type,
            name: this._name,
            operator: this._operator,
            components: this._components.map(c => c?.serialize?.() ?? c.toString()),
            complexity: this._complexity,
            id: this._id,
            hash: this._hash,
            semanticType: this._semanticType,
            version: '1.0.0'
        };
    }
}
