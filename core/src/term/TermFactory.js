import { Term, TermType } from './Term.js';
import { BaseComponent } from '../util/BaseComponent.js';
import { IntrospectionEvents } from '../util/IntrospectionEvents.js';
import { TermCache } from './TermCache.js';

export { Term };

const COMMUTATIVE_OPERATORS = new Set(['&', '|', '+', '<->', '||', '&&', '<~>', '{}', '[]', '=', '<=>']);
const ASSOCIATIVE_OPERATORS = new Set(['&', '|', '||', '&&']);
const RELATIONAL_OPERATORS = ['-->', '<->', '==>', '<=>'];
const SET_OPERATORS = ['{}', '[]'];
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
        this._complexityCache = new Map();
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

        // If it's a string, treat as atomic name
        if (typeof data === 'string') return this.create(data);

        // If it has components, they need to be deserialized first if they aren't Terms
        // Note: this.create() handles recursive creation, so we can just pass the object
        // provided it matches the structure expected by create().
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
        const { operator: op, components: comps } = this._normalizeTermData(operator, components);

        // Handle reflexive relations (e.g., <-> A A) which are tautologies
        if (RELATIONAL_OPERATORS.includes(op) && comps.length === 2 && comps[0].name === comps[1].name) {
             return this.createTrue();
        }

        if (COMMUTATIVE_OPERATORS.has(op) && comps.length === 1 && !SET_OPERATORS.includes(op)) {
            return comps[0];
        }

        if (op === '--' && comps[0]?.operator === '--' && comps[0].components.length) {
            return comps[0].components[0];
        }

        if (op === '==>' && comps.length === 2 && comps[1].operator === '--' && comps[1].components.length) {
            const innerImp = this._createCompound('==>', [comps[0], comps[1].components[0]]);
            return this._createCompound('--', [innerImp]);
        }

        return this._processCanonicalAndCache(op, comps);
    }

    _processCanonicalAndCache(operator, components) {
        const normalizedComponents = this._canonicalizeComponents(operator, components);
        const name = this._buildCanonicalName(operator, normalizedComponents);
        const cachedTerm = this._cache.get(name);

        if (cachedTerm) {
            this._emitIntrospectionEvent(IntrospectionEvents.TERM_CACHE_HIT, () => ({ termName: name }));
            return cachedTerm;
        }

        this._emitIntrospectionEvent(IntrospectionEvents.TERM_CACHE_MISS, () => ({ termName: name }));
        const term = this._createAndCache(operator, normalizedComponents, name);
        this._calculateComplexityMetrics(term);
        return term;
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
        const cached = this._cache.get(name);
        if (cached) return cached;

        const term = this._createAndCache(null, [], name);
        this._complexityCache.set(name, 1);
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

        const evictedKey = this._cache.setWithEviction(name, term);
        if (evictedKey) {
            this._complexityCache.delete(evictedKey);
        }

        this._emitIntrospectionEvent(IntrospectionEvents.TERM_CREATED, () => ({ termName: name }));
        return term;
    }

    _normalizeTermData(operator, components) {
        if (!Array.isArray(components)) {
            throw new Error('TermFactory._normalizeTermData: components must be an array');
        }

        let normalizedComponents = components.map(comp => comp instanceof Term ? comp : this.create(comp));

        if (operator) {
            this._validateOperator(operator);

            if (ASSOCIATIVE_OPERATORS.has(operator)) {
                normalizedComponents = this._flatten(operator, normalizedComponents);
            }

            if (COMMUTATIVE_OPERATORS.has(operator)) {
                normalizedComponents = operator === '='
                    ? normalizedComponents.sort(this._compareTermsAlphabetically)
                    : this._normalizeCommutative(normalizedComponents);

                if (IDEMPOTENT_OPERATORS.has(operator)) {
                    normalizedComponents = this._removeRedundancy(normalizedComponents);
                }
            }
        }

        return { operator, components: normalizedComponents };
    }

    _validateOperator(op) {
        if (typeof op !== 'string') throw new Error('TermFactory._validateOperator: operator must be a string');
    }

    _flatten(op, comps) {
        return comps.flatMap(c => c?.operator === op ? c.components : [c]);
    }

    _normalizeCommutative(comps) {
        return comps.sort(this._compareTermsAlphabetically);
    }

    _compareTermsAlphabetically(termA, termB) {
        return termA.name.localeCompare(termB.name);
    }

    _getStructuralComplexity(term) {
        return !term?.components?.length ? 1 : 1 + Math.max(
            ...term.components.map(comp => comp?.components?.length ? this._getStructuralComplexity(comp) : 1)
        );
    }

    _canonicalizeComponents(operator, components) {
        if (!operator) return components;

        if (['<->', '<=>'].includes(operator)) return this._canonicalizeEquivalence(components);
        if (operator === '-->') return this._canonicalizeImplication(components);

        if (COMMUTATIVE_OPERATORS.has(operator)) {
            let comps = operator === '='
                ? [...components].sort(this._compareTermsAlphabetically)
                : this._normalizeCommutative([...components]);

            if (IDEMPOTENT_OPERATORS.has(operator)) {
                comps = this._removeRedundancy(comps);
            }
            return comps;
        }

        return [...components];
    }

    _canonicalizeEquivalence(components) {
        if (components.length < 2) return components;

        const validComponents = components.length > 2 ? components.slice(0, 2) : components;
        return validComponents.sort((a, b) => {
            const diff = this._getStructuralComplexity(b) - this._getStructuralComplexity(a);
            return diff !== 0 ? diff : a.name.localeCompare(b.name);
        });
    }

    _canonicalizeImplication(components) {
        return components.length < 2 ? components : components.slice(0, 2);
    }

    _removeRedundancy(comps) {
        const seen = new Set();
        return comps.filter(c => {
            if (!c?.name) throw new Error('TermFactory._removeRedundancy: component must have a name property');
            const uniqueId = this._getTermUniqueId(c);
            return seen.has(uniqueId) ? false : (seen.add(uniqueId), true);
        });
    }

    _getTermUniqueId(term) {
        if (!term.operator) return term.name;

        const componentIds = term.components.map(c => this._getTermUniqueId(c));
        if (COMMUTATIVE_OPERATORS.has(term.operator)) componentIds.sort();
        return `${term.operator}_${componentIds.join('|')}`;
    }

    _buildCanonicalName(op, comps) {
        if (!op) return comps[0].toString();

        const pattern = CANONICAL_NAME_PATTERNS[op];
        return pattern
            ? pattern(comps.map(c => c.toString()))
            : `(${op === ',' ? '' : `${op}, `}${comps.map(c => c.toString()).join(', ')})`;
    }

    _calculateComplexityMetrics(term) {
        if (!term) return 0;
        const complexity = term.complexity;
        this._complexityCache.set(term.name, complexity);
        return complexity;
    }

    getComplexity(term) {
        if (typeof term !== 'string' && term?.complexity) {
            return term.complexity;
        }
        const name = typeof term === 'string' ? term : term?.name;

        // 1. Check metadata cache
        if (this._complexityCache.has(name)) {
            return this._complexityCache.get(name);
        }

        // 2. Try to get canonical term from cache (resurrects if in weak cache)
        const cachedTerm = this._cache.get(name);
        if (cachedTerm) {
            // Re-populate metadata cache
            const complexity = cachedTerm.complexity;
            this._complexityCache.set(name, complexity);
            return complexity;
        }

        return 1;
    }

    setMaxCacheSize(size) {
        if (typeof size === 'number' && size > 0) this._cache.setMaxSize(size);
    }

    getCacheSize() {
        return this._cache.size;
    }

    clearCache() {
        this._cache.clear();
        this._complexityCache.clear();
    }

    getStats() {
        const cacheStats = this._cache.stats;
        return {
            cacheSize: this._cache.size,
            complexityCacheSize: this._complexityCache.size,
            cacheHits: cacheStats.hits,
            cacheMisses: cacheStats.misses,
            cacheHitRate: cacheStats.hitRate,
            efficiency: cacheStats.hitRate,
            maxCacheSize: cacheStats.maxSize
        };
    }

    getMostComplexTerms(limit = 10) {
        return Array.from(this._complexityCache.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([name, complexity]) => ({ name, complexity }));
    }

    getSimplestTerms(limit = 10) {
        return Array.from(this._complexityCache.entries())
            .sort((a, b) => a[1] - b[1])
            .slice(0, limit)
            .map(([name, complexity]) => ({ name, complexity }));
    }

    getAverageComplexity() {
        return this._complexityCache.size === 0 ? 0
            : Array.from(this._complexityCache.values()).reduce((sum, c) => sum + c, 0) / this._complexityCache.size;
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
        this._complexityCache = null;
    }
}
