
import { freeze } from '../util/common.js';

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

        return freeze(this);
    }

    get type() {
        return this._type;
    }

    get name() {
        return this._name;
    }

    get operator() {
        return this._operator;
    }

    get components() {
        return this._components;
    }

    get subject() {
        return this._components[0];
    }

    get predicate() {
        return this._components[1];
    }

    get isInheritance() {
        return this._operator === '-->';
    }

    get isImplication() {
        return this._operator === '==>';
    }

    get isSimilarity() {
        return this._operator === '<->';
    }

    get isEquivalence() {
        return this._operator === '<=>';
    }

    get complexity() {
        return this._complexity;
    }

    get hash() {
        return this._hash;
    }

    get id() {
        return this._id;
    }

    get semanticType() {
        return this._semanticType;
    }

    get isAtomic() {
        return this._type === TermType.ATOM;
    }

    get isCompound() {
        return this._type === TermType.COMPOUND;
    }

    get isBoolean() {
        return this._semanticType === SemanticType.BOOLEAN;
    }

    get isNumeric() {
        return this._semanticType === SemanticType.NUMERIC;
    }

    get isVariable() {
        return this._semanticType === SemanticType.VARIABLE;
    }

    get isNALConcept() {
        return this._semanticType === SemanticType.NAL_CONCEPT;
    }

    static hash(str) {
        // Simple FNV-1a hash for browser compatibility without external deps
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

    comp(index) {
        return this._components[index];
    }

    compName(index) {
        return this._components[index]?.name;
    }

    compEquals(index, term) {
        return !!(this._components[index]?.equals?.(term));
    }

    isOp(op) {
        return this._operator === op;
    }

    subjectEquals(term) {
        return this.compEquals(0, term);
    }

    predicateEquals(term) {
        return this.compEquals(1, term);
    }

    _determineSemanticType() {
        if (this._type !== TermType.ATOM) return SemanticType.NAL_CONCEPT;
        if (['True', 'False', 'Null'].includes(this._name)) return SemanticType.BOOLEAN;
        if (this._name?.startsWith('?')) return SemanticType.VARIABLE;
        if (!isNaN(Number(this._name))) return SemanticType.NUMERIC;
        return SemanticType.NAL_CONCEPT;
    }

    _calculateComplexity() {
        return this._type === TermType.ATOM ? 1
            : 1 + this._components.reduce((sum, c) => sum + (c?.complexity ?? 0), 0);
    }

    equals(other) {
        if (!(other instanceof Term) ||
            this._type !== other._type ||
            this._operator !== other._operator ||
            this._name !== other._name) return false;

        if (this._type !== TermType.COMPOUND) return true;

        if (this._components.length !== other._components.length) return false;

        return this._components.every((comp, i) => comp.equals(other._components[i]));
    }

    toString() {
        return this._name;
    }

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
