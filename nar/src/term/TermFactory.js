import {Term, TermType} from './Term.js';
import {BaseComponent, IntrospectionEvents} from '@senars/core';
import {TermCache} from './TermCache.js';

export {Term};

const COMMUTATIVE_OPERATORS = new Set(['&', '|', '+', '<->', '||', '&&', '<~>', '{}', '[]', '=', '<=>']);
const ASSOCIATIVE_OPERATORS = new Set(['&', '|', '||', '&&']);
const RELATIONAL_OPERATORS = new Set(['-->', '<->', '==>', '<=>']);
const SET_OPERATORS = new Set(['{}', '[]']);
const IDEMPOTENT_OPERATORS = new Set(['&', '|', '||', '&&', '{}', '[]']);

const CANONICAL_NAME_PATTERNS = {
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
};

export class TermFactory extends BaseComponent {
    constructor(config = {}, eventBus = null) {
        super(config, 'TermFactory', eventBus);
        this._cache = new TermCache({maxSize: this.config.maxCacheSize ?? 5000});
    }

    fromJSON(data) {
        if (!data) {
            return null;
        }
        if (data instanceof Term) {
            return data;
        }
        if (typeof data === 'string') {
            return this.create(data);
        }
        return this.create(data);
    }

    create(data, components) {
        if (typeof data === 'string' && Array.isArray(components)) {
            return this._createCompound(data, components);
        }
        if (!data) {
            throw new Error('TermFactory.create: data is required');
        }
        if (data instanceof Term) {
            return data;
        }

        const isAtomic = typeof data === 'string' || (data.name && !data.components && !data.operator);
        return isAtomic
            ? this._getOrCreateAtomic(typeof data === 'string' ? data : data.name)
            : this._createCompound(data.operator, data.components);
    }

    _createCompound(operator, components) {
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
        return components.flatMap(comp => {
            const term = comp instanceof Term ? comp : this.create(comp);
            return (isAssociative && term.operator === operator) ? term.components : [term];
        });
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
            this._emitIntrospectionEvent(IntrospectionEvents.TERM_CACHE_HIT, () => ({termName: name}));
            return cachedTerm;
        }

        this._emitIntrospectionEvent(IntrospectionEvents.TERM_CACHE_MISS, () => ({termName: name}));
        return this._createAndCache(operator, components, name);
    }

    atomic(name) {
        return this.create(name);
    }

    variable(name) {
        return this.create(name.startsWith('?') ? name : `?${name}`);
    }

    inheritance(sub, pred) {
        return this._createCompound('-->', [sub, pred]);
    }

    similarity(sub, pred) {
        return this._createCompound('<->', [sub, pred]);
    }

    implication(pre, post) {
        return this._createCompound('==>', [pre, post]);
    }

    equivalence(left, right) {
        return this._createCompound('<=>', [left, right]);
    }

    equality(left, right) {
        return this._createCompound('=', [left, right]);
    }

    conjunction(...terms) {
        return this._createCompound('&', this._flattenArgs(terms));
    }

    disjunction(...terms) {
        return this._createCompound('|', this._flattenArgs(terms));
    }

    parallel(...terms) {
        return this._createCompound('||', this._flattenArgs(terms));
    }

    sequence(...terms) {
        return this._createCompound('&/', this._flattenArgs(terms));
    }

    product(...terms) {
        return this._createCompound('*', this._flattenArgs(terms));
    }

    setExt(...terms) {
        return this._createCompound('{}', this._flattenArgs(terms));
    }

    setInt(...terms) {
        return this._createCompound('[]', this._flattenArgs(terms));
    }

    tuple(...terms) {
        return this._createCompound(',', this._flattenArgs(terms));
    }

    negation(term) {
        return this._createCompound('--', [term]);
    }

    difference(a, b) {
        return this._createCompound('<~>', [a, b]);
    }

    delta(term) {
        return this._createCompound('Δ', [term]);
    }

    extImage(relation, ...terms) {
        return this._createCompound('/', [relation, ...this._flattenArgs(terms)]);
    }

    intImage(relation, ...terms) {
        return this._createCompound('\\', [relation, ...this._flattenArgs(terms)]);
    }

    predicate(pred, args) {
        return this._createCompound('^', [pred, args]);
    }

    _flattenArgs(args) {
        return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    }

    _getOrCreateAtomic(name) {
        return this._cache.get(name) || this._createAndCache(null, [], name);
    }

    _createAndCache(operator, components, name) {
        const existing = this._cache.get(name);
        if (existing) {
            return existing;
        }

        const term = new Term(
            operator ? TermType.COMPOUND : TermType.ATOM,
            name,
            components,
            operator
        );

        this._cache.put(name, term);
        this._emitIntrospectionEvent(IntrospectionEvents.TERM_CREATED, () => ({termName: name}));
        return term;
    }

    _compareTermsAlphabetically(termA, termB) {
        return termA.name.localeCompare(termB.name);
    }

    _canonicalizeComponents(operator, components) {
        if (!operator) {
            return components;
        }

        const handler = CANONICALIZATION_HANDLERS[operator];
        if (handler) {
            return handler.call(this, components);
        }

        if (COMMUTATIVE_OPERATORS.has(operator)) {
            const comps = [...components].sort(this._compareTermsAlphabetically);
            return IDEMPOTENT_OPERATORS.has(operator) ? this._removeRedundancy(comps) : comps;
        }

        return components;
    }

    _handleEquivalenceOperators(components) {
        return (components.length > 2 ? components.slice(0, 2) : [...components])
            .sort((a, b) => (b.complexity - a.complexity) || a.name.localeCompare(b.name));
    }

    _handleImplicationOperators(components) {
        return components.length > 2 ? components.slice(0, 2) : components;
    }

    _removeRedundancy(comps) {
        if (comps.length < 2) {
            return comps;
        }
        const seen = new Set();
        return comps.filter(c => !seen.has(c.name) && seen.add(c.name));
    }

    _buildCanonicalName(op, comps) {
        if (!op) {
            return comps[0].toString();
        }
        const pattern = CANONICAL_NAME_PATTERNS[op];
        if (pattern) {
            return pattern(comps.map(c => c.toString()));
        }
        return `(${op === ',' ? '' : `${op}, `}${comps.map(c => c.toString()).join(', ')})`;
    }

    getComplexity(term) {
        if (typeof term !== 'string' && term?.complexity) {
            return term.complexity;
        }
        const name = typeof term === 'string' ? term : term?.name;
        return this._cache.get(name)?.complexity ?? 1;
    }

    setMaxCacheSize(size) {
        if (typeof size === 'number' && size > 0) {
            this._cache.setMaxSize(size);
        }
    }

    getCacheSize() {
        return this._cache.size;
    }

    clearCache() {
        this._cache.clear();
    }

    getStats() {
        const {hits, misses, hitRate, maxSize} = this._cache.stats;
        return {
            cacheSize: this._cache.size,
            cacheHits: hits,
            cacheMisses: misses,
            cacheHitRate: hitRate,
            maxCacheSize: maxSize
        };
    }

    getMostComplexTerms(limit = 10) {
        return this._topK(limit, (a, b) => b.complexity - a.complexity);
    }

    getSimplestTerms(limit = 10) {
        return this._topK(limit, (a, b) => a.complexity - b.complexity);
    }

    _topK(limit, compareFn) {
        if (limit <= 0) {
            return [];
        }
        return Array.from(this._cache.values())
            .sort(compareFn)
            .slice(0, limit)
            .map(term => ({name: term.name, complexity: term.complexity}));
    }

    getAverageComplexity() {
        let sum = 0;
        let count = 0;
        for (const term of this._cache.values()) {
            sum += term.complexity;
            count++;
        }
        return count === 0 ? 0 : sum / count;
    }

    createTrue() {
        return this._getOrCreateAtomic('True');
    }

    createFalse() {
        return this._getOrCreateAtomic('False');
    }

    createNull() {
        return this._getOrCreateAtomic('Null');
    }

    isSystemAtom(term) {
        return term?.isAtomic && ['True', 'False', 'Null'].includes(term.name);
    }

    async _dispose() {
        this.clearCache();
        this._cache = null;
    }
}

const CANONICALIZATION_HANDLERS = Object.freeze({
    '<->': function (components) {
        return this._handleEquivalenceOperators(components);
    },
    '<=>': function (components) {
        return this._handleEquivalenceOperators(components);
    },
    '-->': function (components) {
        return this._handleImplicationOperators(components);
    }
});
