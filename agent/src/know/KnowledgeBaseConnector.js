import fetch from 'node-fetch';

const PROVIDER_MAP = Object.freeze({
    wikipedia: WikipediaConnector,
    wikidata: WikidataConnector,
    custom: CustomAPIConnector
});

const DEFAULT_RATE_LIMIT = Object.freeze({requests: 10, windowMs: 1000});
const DEFAULT_CACHE_TTL = 300000;

class KnowledgeBaseConnector {
    constructor(config = {}) {
        this.config = config;
        this.connections = new Map();
        this.cache = new Map();
        this.cacheTTL = config.cacheTTL ?? DEFAULT_CACHE_TTL;
        this.rateLimiter = new RateLimiter(config.rateLimit ?? DEFAULT_RATE_LIMIT);
    }

    async connect(providerId, credentials) {
        if (this.connections.has(providerId)) {
            return this.connections.get(providerId);
        }

        const connector = await this._createConnector(providerId, credentials);
        this.connections.set(providerId, connector);
        return connector;
    }

    async _createConnector(providerId, credentials) {
        const ConnectorClass = PROVIDER_MAP[providerId];
        if (!ConnectorClass) {
            throw new Error(`Unknown provider: ${providerId}`);
        }

        const connector = new ConnectorClass(credentials, this.config);
        await connector.initialize();
        return connector;
    }

    async query(providerId, query, options = {}) {
        const cacheKey = this._buildCacheKey(providerId, query);
        const cachedResult = this._getCachedResult(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }

        this._checkRateLimit(providerId);
        const connector = await this.connect(providerId);
        const result = await connector.query(query, options);

        this._cacheResult(cacheKey, result);
        return result;
    }

    _getCachedResult(cacheKey) {
        const cachedResult = this.cache.get(cacheKey);
        return cachedResult && this._isCacheValid(cachedResult) ? cachedResult.data : null;
    }

    _checkRateLimit(providerId) {
        if (!this.rateLimiter.allow(providerId)) {
            throw new Error(`Rate limit exceeded for provider: ${providerId}`);
        }
    }

    _buildCacheKey(providerId, query) {
        return `${providerId}:${JSON.stringify(query)}`;
    }

    _isCacheValid(cachedResult) {
        return Date.now() - cachedResult.timestamp < this.cacheTTL;
    }

    _cacheResult(cacheKey, result) {
        this.cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
    }

    async batchQuery(queries) {
        const results = await Promise.allSettled(
            queries.map(({providerId, query, options}) =>
                this.query(providerId, query, options)
            )
        );

        return results.map((result, index) => ({
            query: queries[index],
            success: result.status === 'fulfilled',
            data: result.value,
            error: result.status === 'rejected' ? result.reason : null
        }));
    }

    clearCache() {
        this.cache.clear();
    }

    getStats() {
        const stats = {};

        for (const [providerId, connector] of this.connections) {
            stats[providerId] = connector.getStats?.() ?? {};
        }

        return stats;
    }
}

class RateLimiter {
    constructor(config = DEFAULT_RATE_LIMIT) {
        this.config = config;
        this.requests = new Map();
    }

    allow(providerId) {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        if (!this.requests.has(providerId)) {
            this.requests.set(providerId, []);
        }

        const providerRequests = this.requests.get(providerId);
        const validRequests = providerRequests.filter(timestamp => timestamp > windowStart);
        this.requests.set(providerId, validRequests);

        if (validRequests.length < this.config.requests) {
            validRequests.push(now);
            return true;
        }

        return false;
    }
}

class WikipediaConnector {
    constructor(credentials, config) {
        this.credentials = credentials;
        this.config = config;
        this.baseUrl = 'https://en.wikipedia.org/api/rest_v1';
        this.initialized = false;
    }

    async initialize() {
        this.initialized = true;
    }

    async query(query, options = {}) {
        this._ensureInitialized();

        const searchQuery = this._extractSearchQuery(query);
        const searchUrl = this._buildWikipediaUrl(searchQuery);

        const response = await this._fetchData(searchUrl);
        const data = await response.json();
        return this._buildResult('wikipedia', searchQuery, [data]);
    }

    _buildWikipediaUrl(searchQuery) {
        return `${this.baseUrl}/page/summary/${encodeURIComponent(searchQuery)}`;
    }

    async _fetchData(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return response;
    }

    _ensureInitialized() {
        if (!this.initialized) {
            throw new Error(`${this.constructor.name} not initialized`);
        }
    }

    _extractSearchQuery(query) {
        return typeof query === 'string' ? query : query.search ?? query.term;
    }

    _buildResult(source, query, results) {
        return {
            source,
            query,
            results,
            timestamp: Date.now()
        };
    }
}

class WikidataConnector {
    constructor(credentials, config) {
        this.credentials = credentials;
        this.config = config;
        this.baseUrl = 'https://query.wikidata.org/sparql';
        this.initialized = false;
    }

    async initialize() {
        this.initialized = true;
    }

    async query(query, options = {}) {
        this._ensureInitialized();

        const sparqlQuery = this._prepareSparqlQuery(query);
        const url = `${this.baseUrl}?query=${encodeURIComponent(sparqlQuery)}`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/sparql-results+json'
            }
        });

        if (!response.ok) {
            throw new Error(`Wikidata API error: ${response.status}`);
        }

        const data = await response.json();
        return this._buildResult('wikidata', sparqlQuery, data.results.bindings);
    }

    _prepareSparqlQuery(query) {
        if (typeof query === 'string') {
            return query;
        }
        return this._buildSparqlQuery(query);
    }

    _buildSparqlQuery(queryObj) {
        const searchTerm = queryObj.search ?? queryObj.term;
        return `
      SELECT ?item ?itemLabel WHERE {
        ?item ?label "${searchTerm}"@en .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 10
    `;
    }

    _ensureInitialized() {
        if (!this.initialized) {
            throw new Error(`${this.constructor.name} not initialized`);
        }
    }

    _buildResult(source, query, results) {
        return {
            source,
            query,
            results,
            timestamp: Date.now()
        };
    }
}

class CustomAPIConnector {
    constructor(credentials, config) {
        this.credentials = credentials;
        this.config = config;
        this.baseUrl = config.baseUrl;
        this.initialized = false;
    }

    async initialize() {
        this.initialized = true;
    }

    async query(query, options = {}) {
        this._ensureInitialized();

        const url = this._buildUrl(query, options);
        const headers = this._buildHeaders();

        const response = await fetch(url, {
            method: options.method ?? 'GET',
            headers
        });

        if (!response.ok) {
            throw new Error(`Custom API error: ${response.status}`);
        }

        const data = await response.json();
        return this._buildResult('custom', query, Array.isArray(data) ? data : [data]);
    }

    _buildUrl(query, options) {
        return `${this.baseUrl}/${query}`;
    }

    _buildHeaders() {
        const headers = {'Content-Type': 'application/json'};
        if (this.credentials?.apiKey) {
            headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
        }
        return headers;
    }

    _ensureInitialized() {
        if (!this.initialized) {
            throw new Error(`${this.constructor.name} not initialized`);
        }
    }

    _buildResult(source, query, results) {
        return {
            source,
            query,
            results,
            timestamp: Date.now()
        };
    }
}

const NORMALIZATION_RULES = Object.freeze({
    wikipedia: (normalizer, data) => normalizer._normalizeData(data, normalizer._normalizeWikipediaItem.bind(normalizer), 'wikipedia'),
    wikidata: (normalizer, data) => normalizer._normalizeData(data, normalizer._normalizeWikidataItem.bind(normalizer), 'wikidata'),
    custom: (_normalizer, data) => Array.isArray(data) ? data : [data]
});

class KnowledgeNormalizer {
    constructor() {
        this.normalizationRules = NORMALIZATION_RULES;
    }

    normalize(source, data) {
        const normalizer = this.normalizationRules[source];
        if (normalizer) {
            return normalizer(this, data);
        }
        return data;
    }

    _normalizeData(data, itemNormalizer, source) {
        if (Array.isArray(data)) {
            return data.map(item => itemNormalizer(item, source));
        }
        return itemNormalizer(data, source);
    }

    _normalizeWikipediaItem(item, source) {
        return {
            id: item.pageid,
            title: item.title,
            extract: item.extract,
            url: item.content_urls?.desktop?.page,
            type: 'fact',
            source
        };
    }

    _normalizeWikidataItem(item, source) {
        return {
            id: item.item?.value?.split('/').pop(),
            label: item.itemLabel?.value,
            description: item.itemDescription?.value,
            type: 'entity',
            source
        };
    }
}

class ExternalKnowledgeManager {
    constructor(config = {}) {
        this.config = config;
        this.connector = new KnowledgeBaseConnector(config.connector ?? {});
        this.normalizer = new KnowledgeNormalizer();
        this.nar = null;
    }

    connectToNAR(nar) {
        this.nar = nar;
    }

    async queryAndIntegrate(query, sources = ['wikipedia', 'wikidata']) {
        if (!this.nar) {
            throw new Error('ExternalKnowledgeManager not connected to NAR');
        }

        const queries = sources.map(providerId => ({
            providerId,
            query,
            options: {}
        }));

        const results = await this.connector.batchQuery(queries);
        const integratedResults = [];

        for (const result of results) {
            if (result.success) {
                const normalized = this.normalizer.normalize(
                    result.query.providerId,
                    result.data.results
                );

                await this.integrateWithNAR(normalized, result.query.providerId);

                integratedResults.push({
                    source: result.query.providerId,
                    data: normalized,
                    integrated: true
                });
            } else {
                integratedResults.push({
                    source: result.query.providerId,
                    error: result.error?.message,
                    integrated: false
                });
            }
        }

        return integratedResults;
    }

    async integrateWithNAR(knowledge, source) {
        if (!this.nar) {
            return;
        }

        for (const item of knowledge) {
            try {
                const narsese = this.convertToNarsese(item);
                if (narsese) {
                    await this.nar.input(narsese);
                }
            } catch (error) {
                console.warn(`Failed to convert knowledge item to Narsese:`, error);
            }
        }
    }

    convertToNarsese(item) {
        if (!item.title && !item.label) {
            return null;
        }

        const subject = item.title ?? item.label;
        const predicate = 'fact';

        return `<${subject.replace(/\s+/g, '_')} --> ${predicate}>. %1.00;0.90%`;
    }

    getStats() {
        return {
            connectorStats: this.connector.getStats(),
            cacheSize: this.connector.cache.size
        };
    }

    clearCache() {
        this.connector.clearCache();
    }
}

const createKnowledgeBaseConnector = (config = {}) => new KnowledgeBaseConnector(config);
const createExternalKnowledgeManager = (config = {}) => new ExternalKnowledgeManager(config);

export {
    KnowledgeBaseConnector,
    ExternalKnowledgeManager,
    createKnowledgeBaseConnector,
    createExternalKnowledgeManager
};