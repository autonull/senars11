import { Term, TermType } from './Term.js';
import { BaseComponent } from '../util/BaseComponent.js';
import { IntrospectionEvents } from '../util/IntrospectionEvents.js';
import { TermCache } from './TermCache.js';

export { Term };

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
        this._cache = new TermCache({ maxSize: this.config.maxCacheSize ?? 5000 });
    }

    /**
     * Deserialize a term from a JSON object or string.
     * Guaranteed to return an interned Term instance.
     * @param {Object|string} data
     * @returns {Term}
     */
    fromJSON(data) {
        if (!data) return null;
        if (data instanceof Term) return data;
        if (typeof data === 'string') return this.create(data);
        return this.create(data);
    }

    create(data, components) {
        if (typeof data === 'string' && Array.isArray(components)) {
            return this._createCompound(data, components);
        }
        if (!data) throw new Error('TermFactory.create: data is required');
        if (data instanceof Term) return data;

        const isAtomic = typeof data === 'string' || (data.name && !data.components && !data.operator);
        return isAtomic
            ? this._getOrCreateAtomic(typeof data === 'string' ? data : data.name)
            : this._createCompound(data.operator, data.components);
    }

    _createCompound(operator, components) {
        // Step 1: Recursively create components and flatten associative operators
        const comps = this._processComponents(operator, components);

        // Step 2: Canonicalize components
        const canonicalComps = this._canonicalizeComponents(operator, comps);

        // Step 3: Apply simplifications
        const simplified = this._simplify(operator, canonicalComps);
        if (simplified) return simplified;

        return this._cacheLookupOrCreate(operator, canonicalComps);
    }

    _processComponents(operator, components) {
        if (!Array.isArray(components)) {
            throw new Error('TermFactory: components must be an array');
        }

        const isAssociative = ASSOCIATIVE_OPERATORS.has(operator);
        const result = [];

        for (const comp of components) {
            const term = comp instanceof Term ? comp : this.create(comp);
            if (isAssociative && term.operator === operator) {
                // Flattening
                for (const subComp of term.components) {
                    result.push(subComp);
                }
            } else {
                result.push(term);
            }
        }
        return result;
    }

    _simplify(operator, comps) {
        // Tautologies
        if (RELATIONAL_OPERATORS.has(operator) && comps.length === 2 && comps[0].name === comps[1].name) {
             return this.createTrue();
        }

        // Single component commutative (except sets)
        if (COMMUTATIVE_OPERATORS.has(operator) && comps.length === 1 && !SET_OPERATORS.has(operator)) {
            return comps[0];
        }

        // Double negation
        if (operator === '--' && comps[0]?.operator === '--' && comps[0].components.length) {
            return comps[0].components[0];
        }

        // Implication negation
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
        const term = this._createAndCache(operator, components, name);
        return term;
    }

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
        const cached = this._cache.get(name);
        if (cached) return cached;

        const term = this._createAndCache(null, [], name);
        return term;
    }

    _createAndCache(operator, components, name) {
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
             const comps = components.length > 2 ? components.slice(0, 2) : [...components];
             return comps.sort((a, b) => {
                const diff = b.complexity - a.complexity;
                return diff !== 0 ? diff : a.name.localeCompare(b.name);
            });
        }

        if (operator === '-->') {
            return components.length > 2 ? components.slice(0, 2) : components;
        }

        if (COMMUTATIVE_OPERATORS.has(operator)) {
            const comps = [...components];
            comps.sort(this._compareTermsAlphabetically);

            if (IDEMPOTENT_OPERATORS.has(operator)) {
                return this._removeRedundancy(comps);
            }
            return comps;
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
        if (typeof term !== 'string' && term?.complexity) {
            return term.complexity;
        }
        const name = typeof term === 'string' ? term : term?.name;

        const cachedTerm = this._cache.get(name);
        return cachedTerm ? cachedTerm.complexity : 1;
    }

    setMaxCacheSize(size) {
        if (typeof size === 'number' && size > 0) this._cache.setMaxSize(size);
    }

    getCacheSize() { return this._cache.size; }

    clearCache() {
        this._cache.clear();
    }

    getStats() {
        const cacheStats = this._cache.stats;
        return {
            cacheSize: this._cache.size,
            cacheHits: cacheStats.hits,
            cacheMisses: cacheStats.misses,
            cacheHitRate: cacheStats.hitRate,
            maxCacheSize: cacheStats.maxSize
        };
    }

    getMostComplexTerms(limit = 10) {
        // Iterate cache values
        return Array.from(this._cache.values())
            .sort((a, b) => b.complexity - a.complexity)
            .slice(0, limit)
            .map(term => ({ name: term.name, complexity: term.complexity }));
    }

    getSimplestTerms(limit = 10) {
         return Array.from(this._cache.values())
            .sort((a, b) => a.complexity - b.complexity)
            .slice(0, limit)
            .map(term => ({ name: term.name, complexity: term.complexity }));
    }

    getAverageComplexity() {
        const terms = Array.from(this._cache.values());
        if (terms.length === 0) return 0;
        return terms.reduce((sum, term) => sum + term.complexity, 0) / terms.length;
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
    }
}
