/**
 * SearchEngine - handles search and query operations for MemoryIndex
 */
export class SearchEngine {
    constructor(memoryIndex) {
        this.memoryIndex = memoryIndex;
    }

    /**
     * Find concepts with advanced filtering options
     */
    findConceptsWithFilters(filters = {}) {
        let results = this.memoryIndex.getAllConcepts();

        // Apply filters using a filter chain
        const filterChain = [
            filters.category && (concept => this._getTermCategorization().getTermCategory(concept.term) === filters.category),
            (filters.minComplexity || filters.maxComplexity) && (concept => {
                const complexity = this._getTermCategorization().getTermComplexity(concept.term);
                return (!filters.minComplexity || complexity >= filters.minComplexity) &&
                    (!filters.maxComplexity || complexity <= filters.maxComplexity);
            }),
            (filters.minActivation !== undefined || filters.maxActivation !== undefined) && (concept => {
                const activation = concept.activation || 0;
                return (filters.minActivation === undefined || activation >= filters.minActivation) &&
                    (filters.maxActivation === undefined || activation <= filters.maxActivation);
            }),
            filters.operator && (concept => concept.term.operator === filters.operator),
            (filters.createdAfter || filters.createdBefore) && (concept => {
                const createdAt = concept.createdAt || 0;
                return (!filters.createdAfter || createdAt >= filters.createdAfter) &&
                    (!filters.createdBefore || createdAt <= filters.createdBefore);
            })
        ].filter(Boolean);

        for (const filter of filterChain) {
            results = results.filter(filter);
        }

        return results;
    }

    /**
     * Get concepts ordered by relevance score for a given query term
     */
    findConceptsByRelevance(queryTerm, limit = 10) {
        const allConcepts = this.memoryIndex.getAllConcepts();
        const scoredConcepts = allConcepts.map(concept => {
            const score = this._calculateRelevanceScore(queryTerm, concept.term);
            return {concept, score};
        });

        // Sort by score descending and limit results
        return scoredConcepts
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.concept);
    }

    /**
     * Calculate relevance score between query term and concept term
     */
    _calculateRelevanceScore(queryTerm, conceptTerm) {
        // Exact match gets highest score
        if (queryTerm.toString() === conceptTerm.toString()) {
            return 1.0;
        }

        let score = 0;

        // Operator match
        if (queryTerm.operator && conceptTerm.operator === queryTerm.operator) {
            score += 0.3;
        }

        // Component overlap
        if (queryTerm.components && conceptTerm.components) {
            const queryComponents = new Set(queryTerm.components.map(c => c.toString()));
            const conceptComponents = new Set(conceptTerm.components.map(c => c.toString()));

            const intersection = [...queryComponents].filter(x => conceptComponents.has(x)).length;
            const union = new Set([...queryComponents, ...conceptComponents]).size;

            if (union > 0) {
                score += 0.5 * (intersection / union);
            }
        }

        // Atomic term name similarity
        if (queryTerm.name && conceptTerm.name) {
            // Simple string similarity (could be enhanced with more sophisticated algorithms)
            const queryName = queryTerm.name.toLowerCase();
            const conceptName = conceptTerm.name.toLowerCase();

            if (queryName === conceptName) {
                score += 0.4;
            } else if (queryName.includes(conceptName) || conceptName.includes(queryName)) {
                score += 0.2;
            }
        }

        return Math.min(1.0, score); // Cap at 1.0
    }

    /**
     * Search concepts by text patterns
     */
    _searchConceptsByText(searchTerm, limit) {
        const normalizedSearch = searchTerm.toLowerCase();
        const results = [];

        for (const concept of this.memoryIndex.getAllConcepts()) {
            const term = concept.term;
            let relevance = 0;

            // Compute relevance based on different matches
            if (term.name && term.name.toLowerCase().includes(normalizedSearch)) {
                relevance += 0.5;
            }

            if (term.components) {
                for (const component of term.components) {
                    if (component.name && component.name.toLowerCase().includes(normalizedSearch)) {
                        relevance += 0.3;
                        break;
                    }
                }
            }

            if (term.operator && term.operator.toLowerCase().includes(normalizedSearch)) {
                relevance += 0.2;
            }

            if (relevance > 0) {
                results.push({concept, relevance});
            }
        }

        // Sort by relevance and limit
        return results
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, limit)
            .map(item => item.concept);
    }

    /**
     * Get statistical summary of concept distribution
     */
    getConceptDistribution() {
        const concepts = this.memoryIndex.getAllConcepts();
        const distribution = {
            byCategory: {},
            byComplexity: {},
            byOperator: {},
            byActivation: {},
            total: this.memoryIndex._totalConcepts
        };

        // Collect statistics
        for (const concept of concepts) {
            const category = this._getTermCategorization().getTermCategory(concept.term);
            distribution.byCategory[category] = (distribution.byCategory[category] || 0) + 1;

            const complexity = this._getTermCategorization().getTermComplexity(concept.term);
            const complexityLevel = Math.floor(complexity);
            distribution.byComplexity[complexityLevel] = (distribution.byComplexity[complexityLevel] || 0) + 1;

            if (concept.term.operator) {
                const operator = concept.term.operator;
                distribution.byOperator[operator] = (distribution.byOperator[operator] || 0) + 1;
            }

            const activation = concept.activation || 0;
            const activationBucket = Math.floor(activation * 10) / 10; // Bucket by 0.1 increments
            distribution.byActivation[activationBucket] = (distribution.byActivation[activationBucket] || 0) + 1;
        }

        return distribution;
    }

    /**
     * Find concepts that are most active (have high activation values)
     */
    getMostActiveConcepts(limit = 10) {
        return this.memoryIndex.getAllConcepts()
            .filter(concept => concept.activation > 0)
            .sort((a, b) => (b.activation || 0) - (a.activation || 0))
            .slice(0, limit);
    }

    /**
     * Find recently created concepts
     */
    getRecentConcepts(limit = 10) {
        return this.memoryIndex.getAllConcepts()
            .filter(concept => concept.createdAt)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, limit);
    }

    /**
     * Get concepts grouped by time periods
     */
    getConceptsByTimePeriod(period = 'day') {
        const now = Date.now();
        const periodMappings = {
            'hour': 3600000,    // 1 hour in ms
            'day': 86400000,     // 1 day in ms
            'week': 604800000,   // 1 week in ms
            'month': 2592000000  // ~1 month in ms
        };

        const periodMs = periodMappings[period] || periodMappings['day'];
        const periodCount = 10; // Show last 10 periods

        // Initialize periods
        const periods = {};
        for (let i = 0; i < periodCount; i++) {
            const periodStart = now - (i * periodMs);
            const periodEnd = periodStart + periodMs;
            periods[i] = {
                start: periodStart,
                end: periodEnd,
                concepts: [],
                count: 0
            };
        }

        // Categorize concepts into periods
        for (const concept of this.memoryIndex.getAllConcepts()) {
            const createdAt = concept.createdAt || 0;

            for (let i = 0; i < periodCount; i++) {
                if (createdAt >= periods[i].start && createdAt < periods[i].end) {
                    periods[i].concepts.push(concept);
                    periods[i].count++;
                    break;
                }
            }
        }

        return periods;
    }

    /**
     * Export index data in various formats
     */
    export(format = 'json') {
        const data = {
            concepts: this.memoryIndex.getAllConcepts(),
            stats: this.memoryIndex.getStats(),
            config: this.memoryIndex._config,
            timestamp: Date.now()
        };

        const exporter = EXPORT_STRATEGIES[format.toLowerCase()] || EXPORT_STRATEGIES.json;
        return exporter.call(this, data);
    }

    _exportToJSON(data) {
        return JSON.stringify(data, null, 2);
    }

    _exportToCSV(data) {
        let csv = 'Term,Category,Complexity,Activation,CreatedAt\n';

        for (const concept of data.concepts) {
            const term = concept.term.name || concept.term.toString();
            const category = this._getTermCategorization().getTermCategory(concept.term);
            const complexity = this._getTermCategorization().getTermComplexity(concept.term);
            const activation = concept.activation || 0;
            const createdAt = concept.createdAt || 0;

            csv += `"${term}",${category},${complexity},${activation},${createdAt}\n`;
        }

        return csv;
    }

    /**
     * Get related concepts using multiple relationship types
     */
    findRelatedConceptsExtended(term, options = {}) {
        const {
            relationshipTypes = ['inheritance', 'implication', 'similarity'],
            maxDepth = 3,
            includeIndirect = true
        } = options;

        const relatedConcepts = new Set();
        const visitedTerms = new Set();

        const traverseRelationships = (currentTerm, depth) => {
            if (depth > maxDepth || visitedTerms.has(currentTerm.toString())) {
                return;
            }

            visitedTerms.add(currentTerm.toString());

            // Process all relationship types at the current level
            relationshipTypes.forEach(relType => {
                const finder = {
                    'inheritance': () => this.memoryIndex.findInheritanceConcepts(currentTerm),
                    'implication': () => this.memoryIndex.findImplicationConcepts(currentTerm),
                    'similarity': () => this.memoryIndex.findSimilarityConcepts(currentTerm)
                }[relType];

                if (finder) {
                    finder().forEach(concept => relatedConcepts.add(concept));
                }
            });

            // Indirect relationships (traverse deeper)
            if (includeIndirect && depth < maxDepth) {
                for (const concept of Array.from(relatedConcepts)) {
                    if (concept.term) {
                        traverseRelationships(concept.term, depth + 1);
                    }
                }
            }
        };

        traverseRelationships(term, 0);

        return Array.from(relatedConcepts);
    }

    /**
     * Search for related concepts using multiple indexing strategies
     */
    findRelatedConcepts(term, searchOptions = {}) {
        const {
            maxResults = 10,
            includeCategories = [],
            excludeCategories = [],
            minActivation = 0,
            useSemanticSimilarity = true,
            searchDepth = 2
        } = searchOptions;

        const results = new Map(); // Use Map to store concept and relevance score

        // Find by components (subterm matching) - this is the most precise
        if (term.components) {
            for (const comp of term.components) {
                const byComponent = this.memoryIndex.findConceptsByComponent(comp);
                for (const concept of byComponent) {
                    if (this._shouldSkipConcept(concept, excludeCategories, includeCategories, minActivation)) continue;

                    // Calculate relevance based on component match
                    const relevance = this._calculateRelevance(term, concept.term, 'component');
                    results.set(concept, {relevance, method: 'component'});
                }
            }
        }

        // Find by category
        const category = this._getTermCategorization().getTermCategory(term);
        if (!excludeCategories.includes(category) &&
            (includeCategories.length === 0 || includeCategories.includes(category))) {
            const byCategory = this.memoryIndex.findConceptsByCategory(category);
            for (const concept of byCategory) {
                if (results.has(concept)) continue; // Skip if already found via components
                if (concept.activation < minActivation) continue;

                const relevance = this._calculateRelevance(term, concept.term, 'category');
                results.set(concept, {relevance, method: 'category'});
            }
        }

        // Semantic similarity search (if enabled)
        if (useSemanticSimilarity) {
            const semanticResults = this._findSemanticallySimilarConcepts(term, searchDepth);
            for (const [concept, relevance] of semanticResults.entries()) {
                if (results.has(concept)) continue; // Skip if already found
                if (concept.activation < minActivation) continue;

                results.set(concept, {relevance, method: 'semantic'});
            }
        }

        // Convert to array, sort by relevance, and return top results
        const sortedResults = Array.from(results.entries())
            .sort((a, b) => b[1].relevance - a[1].relevance)
            .slice(0, maxResults)
            .map(entry => entry[0]); // Return just the concepts, not the relevance scores

        return sortedResults;
    }

    _shouldSkipConcept(concept, excludeCategories, includeCategories, minActivation) {
        const category = this._getTermCategorization().getTermCategory(concept.term);
        return excludeCategories.includes(category) ||
            (includeCategories.length > 0 && !includeCategories.includes(category)) ||
            concept.activation < minActivation;
    }

    /**
     * Find semantically similar concepts based on structural similarity
     */
    _findSemanticallySimilarConcepts(term, depth = 2) {
        const results = new Map();

        // Calculate similarity with all concepts of the same category
        const category = this._getTermCategorization().getTermCategory(term);
        const sameCategoryConcepts = this.memoryIndex.findConceptsByCategory(category);

        for (const concept of sameCategoryConcepts) {
            if (concept.term === term) continue; // Skip self

            const similarityScore = this._calculateStructuralSimilarity(term, concept.term);
            if (similarityScore > 0.1) { // Only include if somewhat similar
                results.set(concept, similarityScore);
            }
        }

        return results;
    }

    /**
     * Calculate relevance score between two terms based on the search method
     */
    _calculateRelevance(term1, term2, method) {
        const methods = {
            'component': () => this._calculateStructuralSimilarity(term1, term2),
            'category': () => 0.5, // Medium relevance for category match
            'semantic': () => this._calculateStructuralSimilarity(term1, term2) // Use structural similarity for semantic relevance
        };

        return methods[method] ? methods[method]() : 0.1; // Low default relevance
    }

    /**
     * Calculate structural similarity between two terms
     */
    _calculateStructuralSimilarity(term1, term2) {
        // For atomic terms with same name, return maximum similarity
        if (!term1?.operator && !term2?.operator && term1?.name === term2?.name) {
            return 1.0;
        }

        // For compound terms, calculate similarity based on shared components
        if (term1?.components && term2?.components) {
            const components1 = new Set(term1.components.map(c => c.name));
            const components2 = new Set(term2.components.map(c => c.name));

            // Calculate Jaccard similarity coefficient
            const intersection = [...components1].filter(x => components2.has(x)).length;
            const union = new Set([...components1, ...components2]).size;

            return union > 0 ? intersection / union : 0;
        }

        // For terms with different structures, return low similarity
        return 0.1;
    }

    _getTermCategorization() {
        // This would need to be imported from the appropriate module
        // For now, we'll access it from the memoryIndex instance
        if (!this._termCategorizationModule) {
            this._termCategorizationModule = this.memoryIndex._getTermCategorizationModule();
        }
        return this._termCategorizationModule;
    }
}

const EXPORT_STRATEGIES = Object.freeze({
    json: function(data) {
        return this._exportToJSON(data);
    },
    csv: function(data) {
        return this._exportToCSV(data);
    },
    raw: function(data) {
        return data;
    }
});