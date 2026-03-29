const freeze = Object.freeze;

export const TermType = Object.freeze({
    ATOM: 'atom',
    COMPOUND: 'compound',
});

export const SemanticType = Object.freeze({
    BOOLEAN: 'boolean',
    NUMERIC: 'numeric',
    VARIABLE: 'variable',
    NAL_CONCEPT: 'nal_concept',
    UNKNOWN: 'unknown'
});

export class Term {
    constructor(type, name, components = [], operator = null) {
        this._type = type;
        this._name = name;
        this._operator = operator;
        this._components = freeze(type === TermType.ATOM && !components.length ? [name] : components);

        this._complexity = this._calculateComplexity();
        this._id = name;
        this._hash = Term.hash(this._id);
        this._semanticType = this._determineSemanticType();
        this._typeTag = this._calculateTypeTag();

        return freeze(this);
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
        if (['True', 'False', 'Null'].includes(this._name)) return SemanticType.BOOLEAN;
        if (this._name?.startsWith('?')) return SemanticType.VARIABLE;
        return isNaN(Number(this._name)) ? SemanticType.NAL_CONCEPT : SemanticType.NUMERIC;
    }

    _calculateTypeTag() {
        // Fast path constants matching metta/src/kernel/FastPaths.js
        if (this._type === TermType.COMPOUND) return 3; // TYPE_EXPRESSION
        if (this._name?.startsWith('?') || this._name?.startsWith('$')) return 2; // TYPE_VARIABLE
        return 1; // TYPE_SYMBOL
    }

    _calculateComplexity() {
        if (this._type === TermType.ATOM) return 1;

        let sum = 0;
        // Iterative-ish: Relies on components having complexity calculated (recursion)
        // But prevents stack overflow if components are lazy? No, they are eagerly created.
        // Safety: Limit depth implicitly by budget elsewhere, but here we just sum.
        for (const c of this._components) {
            sum += c ? c.complexity : 0;
        }
        return 1 + sum;
    }

    equals(other) {
        if (this === other) return true;
        if (!(other instanceof Term) ||
            this._hash !== other._hash ||
            this._type !== other._type ||
            this._operator !== other._operator ||
            this._name !== other._name) return false;

        return this._type === TermType.COMPOUND
            ? this._components.length === other._components.length && this._components.every((comp, i) => comp.equals(other._components[i]))
            : true;
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
