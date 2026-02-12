import { Term, TermType } from './Term.js';
import { BaseComponent } from '../util/BaseComponent.js';
import { IntrospectionEvents } from '../util/IntrospectionEvents.js';
import { TermCache } from './TermCache.js';

export { Term };

const COMMUTATIVE_OPERATORS = Object.freeze(new Set(['&', '|', '+', '<->', '||', '&&', '<~>', '{}', '[]', '=', '<=>']));
const ASSOCIATIVE_OPERATORS = Object.freeze(new Set(['&', '|', '||', '&&']));
const RELATIONAL_OPERATORS = Object.freeze(new Set(['-->', '<->', '==>', '<=>']));
const SET_OPERATORS = Object.freeze(new Set(['{}', '[]']));
const IDEMPOTENT_OPERATORS = Object.freeze(new Set(['&', '|', '||', '&&', '{}', '[]']));

const CANONICAL_NAME_PATTERNS = Object.freeze({
    '--': (n) => `(--, ${n[0]})`,
    '&': (n) => `(&, ${n.join(', ')})`,
    '|': (n) => `(|, ${n.join(', ')})`,
    '&/': (n) => `(&/, ${n.join(', ')})`,
    '-->': (n) => `(-->, ${n[0]}, ${n[1]})`,
    '<->': (n) => `(<->, ${n[0]}, ${n[1]})`,
    '==>': (n) => `(==>, ${n[0]}, ${n[1]})`,
    '<=>': (n) => `(<=>, ${n[0]}, ${n[1]})`,
    '=': (n) => `(=, ${n[0]}, ${n[1]})`,
    '<~>': (n) => `(<~>, ${n[0]}, ${n[1]})`,
    'Δ': (n) => `Δ${n[0]}`,
    '^': (n) => `(^, ${n[0]}, ${n[1]})`,
    '{{--': (n) => `({{--, ${n[0]}, ${n[1]})`,
    '--}}': (n) => `(--}}, ${n[0]}, ${n[1]})`,
    '{}': (n) => `{${n.join(', ')}}`,
    '[]': (n) => `[${n.join(', ')}]`,
    ',': (n) => `(${n.join(', ')})`
});

/**
 * Factory for creating and managing Term instances.
 * Handles canonicalization, caching, and simplification of terms.
 */
export class TermFactory extends BaseComponent {
    constructor(config = {}, eventBus = null) {
        super(config, 'TermFactory', eventBus);
        this._cache = new TermCache({ maxSize: this.config.maxCacheSize ?? 5000 });
    }

    /**
     * Creates a Term from JSON or string representation.
     * @param {Object|string} data
     * @returns {Term|null}
     */
    fromJSON(data) {
        if (!data) return null;
        if (data instanceof Term) return data;
        if (typeof data === 'string') return this.create(data);
        return this.create(data);
    }

    /**
     * Creates a term.
     * @param {string|Object} data - Name or term object
     * @param {Array<Term>} [components] - Optional components for compound terms
     * @returns {Term}
     */
    create(data, components) {
        if (!data) throw new Error('TermFactory.create: data is required');

        if (typeof data === 'string' && Array.isArray(components)) {
            return this._createCompound(data, components);
        }

        if (data instanceof Term) return data;

        const isAtomic = typeof data === 'string' || (data.name && !data.components && !data.operator);
        return isAtomic
            ? this._getOrCreateAtomic(typeof data === 'string' ? data : data.name)
            : this._createCompound(data.operator, data.components);
    }

    _createCompound(operator, components) {
        if (!operator) throw new Error('TermFactory: Operator is required for compound terms');

        const comps = this._processComponents(operator, components);
        const canonicalComps = this._canonicalizeComponents(operator, comps);
        const simplified = this._simplify(operator, canonicalComps);

        return simplified || this._cacheLookupOrCreate(operator, canonicalComps);
    }

    _processComponents(operator, components) {
        if (!Array.isArray(components)) {
            throw new Error('TermFactory: components must be an array');
        }

        const isAssociative = ASSOCIATIVE_OPERATORS.has(operator);
        // Optimization: Single pass map + flatMap equivalent
        const result = [];
        for (const comp of components) {
            const term = comp instanceof Term ? comp : this.create(comp);
            if (isAssociative && term.operator === operator) {
                for (const c of term.components) result.push(c);
            } else {
                result.push(term);
            }
        }
        return result;
    }

    _simplify(operator, comps) {
        if (RELATIONAL_OPERATORS.has(operator) && comps.length === 2 && comps[0].name === comps[1].name) {
             return this.createTrue();
        }

        if (COMMUTATIVE_OPERATORS.has(operator) && comps.length === 1 && !SET_OPERATORS.has(operator)) {
            return comps[0];
        }

        if (operator === '--' && comps[0]?.operator === '--' && comps[0].components.length) {
            return comps[0].components[0];
        }

        if (operator === '==>' && comps.length === 2 && comps[1].operator === '--' && comps[1].components.length) {
             const innerImp = this._createCompound('==>', [comps[0], comps[1].components[0]]);
             return this._createCompound('--', [innerImp]);
        }

        return null;
    }

    _cacheLookupOrCreate(operator, components) {
        const name = this._buildCanonicalName(operator, components);
        const cachedTerm = this._cache.get(name);

        if (cachedTerm) {
            this._emitIntrospectionEvent(IntrospectionEvents.TERM_CACHE_HIT, () => ({ termName: name }));
            return cachedTerm;
        }

        this._emitIntrospectionEvent(IntrospectionEvents.TERM_CACHE_MISS, () => ({ termName: name }));
        return this._createAndCache(operator, components, name);
    }

    // Fluent API helpers
    atomic(name) { return this.create(name); }
    variable(name) { return this.create(name.startsWith('?') ? name : `?${name}`); }
    inheritance(sub, pred) { return this._createCompound('-->', [sub, pred]); }
    similarity(sub, pred) { return this._createCompound('<->', [sub, pred]); }
    implication(pre, post) { return this._createCompound('==>', [pre, post]); }
    equivalence(left, right) { return this._createCompound('<=>', [left, right]); }
    equality(left, right) { return this._createCompound('=', [left, right]); }

    conjunction(...terms) { return this._createCompound('&', this._flattenArgs(terms)); }
    disjunction(...terms) { return this._createCompound('|', this._flattenArgs(terms)); }
    parallel(...terms) { return this._createCompound('||', this._flattenArgs(terms)); }
    sequence(...terms) { return this._createCompound('&/', this._flattenArgs(terms)); }
    product(...terms) { return this._createCompound('*', this._flattenArgs(terms)); }
    setExt(...terms) { return this._createCompound('{}', this._flattenArgs(terms)); }
    setInt(...terms) { return this._createCompound('[]', this._flattenArgs(terms)); }
    tuple(...terms) { return this._createCompound(',', this._flattenArgs(terms)); }

    negation(term) { return this._createCompound('--', [term]); }
    difference(a, b) { return this._createCompound('<~>', [a, b]); }
    delta(term) { return this._createCompound('Δ', [term]); }
    extImage(relation, ...terms) { return this._createCompound('/', [relation, ...this._flattenArgs(terms)]); }
    intImage(relation, ...terms) { return this._createCompound('\\', [relation, ...this._flattenArgs(terms)]); }
    predicate(pred, args) { return this._createCompound('^', [pred, args]); }

    _flattenArgs(args) {
        return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    }

    _getOrCreateAtomic(name) {
        return this._cache.get(name) || this._createAndCache(null, [], name);
    }

    _createAndCache(operator, components, name) {
        // Double check cache in case of race/recursion (though JS is single threaded, recursion can happen)
        const existing = this._cache.get(name);
        if (existing) return existing;

        const term = new Term(
            operator ? TermType.COMPOUND : TermType.ATOM,
            name,
            components,
            operator
        );

        this._cache.put(name, term);
        this._emitIntrospectionEvent(IntrospectionEvents.TERM_CREATED, () => ({ termName: name }));
        return term;
    }

    _compareTermsAlphabetically(termA, termB) {
        return termA.name.localeCompare(termB.name);
    }

    _canonicalizeComponents(operator, components) {
        if (!operator) return components;

        if (operator === '<->' || operator === '<=>') {
             // Sort by complexity then name for canonical ordering of symmetric relations
             return (components.length > 2 ? components.slice(0, 2) : [...components])
                .sort((a, b) => (b.complexity - a.complexity) || a.name.localeCompare(b.name));
        }

        if (operator === '-->') {
             return components.length > 2 ? components.slice(0, 2) : components;
        }

        if (COMMUTATIVE_OPERATORS.has(operator)) {
            const comps = [...components].sort(this._compareTermsAlphabetically);
            return IDEMPOTENT_OPERATORS.has(operator) ? this._removeRedundancy(comps) : comps;
        }

        return components;
    }

    _removeRedundancy(comps) {
        if (comps.length < 2) return comps;
        const result = [];
        const seen = new Set();
        for (const c of comps) {
            if (!seen.has(c.name)) {
                seen.add(c.name);
                result.push(c);
            }
        }
        return result;
    }

    _buildCanonicalName(op, comps) {
        if (!op) return comps[0].toString();
        const pattern = CANONICAL_NAME_PATTERNS[op];
        if (pattern) return pattern(comps.map(c => c.toString()));
        return `(${op === ',' ? '' : `${op}, `}${comps.map(c => c.toString()).join(', ')})`;
    }

    getComplexity(term) {
        if (typeof term !== 'string' && term?.complexity) return term.complexity;
        const name = typeof term === 'string' ? term : term?.name;
        return this._cache.get(name)?.complexity ?? 1;
    }

    setMaxCacheSize(size) {
        if (typeof size === 'number' && size > 0) this._cache.setMaxSize(size);
    }

    getCacheSize() { return this._cache ? this._cache.size : 0; }

    clearCache() {
        if (this._cache) this._cache.clear();
    }

    getStats() {
        if (!this._cache) return { cacheSize: 0, cacheHits: 0, cacheMisses: 0, cacheHitRate: 0, maxCacheSize: 0 };
        const { hits, misses, hitRate, maxSize } = this._cache.stats;
        return { cacheSize: this._cache.size, cacheHits: hits, cacheMisses: misses, cacheHitRate: hitRate, maxCacheSize: maxSize };
    }

    getMostComplexTerms(limit = 10) {
        return this._topK(limit, (a, b) => b.complexity - a.complexity);
    }

    getSimplestTerms(limit = 10) {
        return this._topK(limit, (a, b) => a.complexity - b.complexity);
    }

    _topK(limit, compareFn) {
        if (limit <= 0 || !this._cache) return [];
        const top = [];
        for (const term of this._cache.values()) {
            top.push(term);
            top.sort(compareFn);
            if (top.length > limit) top.pop();
        }
        return top.map(term => ({ name: term.name, complexity: term.complexity }));
    }

    getAverageComplexity() {
        if (!this._cache || this._cache.size === 0) return 0;
        let sum = 0;
        let count = 0;
        for (const term of this._cache.values()) {
            sum += term.complexity;
            count++;
        }
        return sum / count;
    }

    createTrue() { return this._getOrCreateAtomic('True'); }
    createFalse() { return this._getOrCreateAtomic('False'); }
    createNull() { return this._getOrCreateAtomic('Null'); }

    isSystemAtom(term) {
        return term?.isAtomic && ['True', 'False', 'Null'].includes(term.name);
    }

    async _dispose() {
        this.clearCache();
        this._cache = null;
        super._dispose();
    }
}
