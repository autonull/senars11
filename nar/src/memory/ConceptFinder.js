import {TermCategorization} from './TermCategorization.js';

export class ConceptFinder {
    constructor(atomicIndex, compoundIndex, activationIndex, temporalIndex) {
        this._atomicIndex = atomicIndex;
        this._compoundIndex = compoundIndex;
        this._activationIndex = activationIndex;
        this._temporalIndex = temporalIndex;
    }

    findConceptsWithFilters(filters = {}, getAllConcepts) {
        const candidates = this._getInitialCandidates(filters, getAllConcepts);
        const filterFunctions = this._getFilterFunctions(filters);
        const activeFilters = Object.keys(filters).filter(key =>
            filters[key] !== undefined && filterFunctions[key]
        );
        return activeFilters.length === 0
            ? candidates
            : candidates.filter(concept =>
                activeFilters.every(filterName => filterFunctions[filterName](concept))
            );
    }

    _getInitialCandidates(filters, getAllConcepts) {
        if (filters.operator) {
            return this._compoundIndex.find({operator: filters.operator});
        } else if (filters.category) {
            return this._compoundIndex.find({category: filters.category});
        } else if (filters.minComplexity !== undefined || filters.maxComplexity !== undefined) {
            return this._compoundIndex.find({
                minComplexity: filters.minComplexity,
                maxComplexity: filters.maxComplexity
            });
        } else if (filters.minActivation !== undefined || filters.maxActivation !== undefined) {
            return this._activationIndex.find({
                minActivation: filters.minActivation,
                maxActivation: filters.maxActivation
            });
        } else if (filters.createdAfter !== undefined || filters.createdBefore !== undefined) {
            return this._temporalIndex.find({
                createdAfter: filters.createdAfter,
                createdBefore: filters.createdBefore
            });
        } else {
            return getAllConcepts();
        }
    }

    _getFilterFunctions(filters) {
        return {
            category: concept => TermCategorization.getTermCategory(concept.term) === filters.category,
            minComplexity: concept => TermCategorization.getTermComplexity(concept.term) >= filters.minComplexity,
            maxComplexity: concept => TermCategorization.getTermComplexity(concept.term) <= filters.maxComplexity,
            minActivation: concept => (concept.activation || 0) >= filters.minActivation,
            maxActivation: concept => (concept.activation || 0) <= filters.maxActivation,
            operator: concept => concept.term?.operator === filters.operator,
            createdAfter: concept => (concept.createdAt || 0) >= filters.createdAfter,
            createdBefore: concept => (concept.createdAt || 0) <= filters.createdBefore
        };
    }

    findConceptsByRelevance(queryTerm, limit, getAllConcepts, calculateRelevanceScore) {
        const allConcepts = getAllConcepts();
        const scoredConcepts = allConcepts.map(concept => ({
            concept,
            score: calculateRelevanceScore(queryTerm, concept.term)
        }));
        return scoredConcepts
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.concept);
    }

    queryConcepts(query, options, getAllConcepts, searchConceptsByText, findConceptsWithFilters) {
        const {limit = 50} = options;
        const handlers = {
            'function': () => getAllConcepts().filter(query).slice(0, limit),
            'string': () => searchConceptsByText(query, limit),
            'object': () => findConceptsWithFilters(query).slice(0, limit)
        };
        return (handlers[typeof query] || (() => []))();
    }

    searchConceptsByText(searchTerm, limit, getAllConcepts) {
        const normalizedSearch = searchTerm.toLowerCase();
        const results = [];
        for (const concept of getAllConcepts()) {
            const {term} = concept;
            let relevance = 0;
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
        return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit).map(item => item.concept);
    }

    findConceptsByOperator(operator) {
        return this._compoundIndex.find({operator});
    }

    findConceptsByComplexity(level) {
        return this._compoundIndex.find({minComplexity: level, maxComplexity: level});
    }

    findConceptsByCategory(category) {
        return this._compoundIndex.find({category});
    }

    findConceptsByActivation(minActivation, maxActivation) {
        return this._activationIndex.find({minActivation, maxActivation});
    }

    findConceptsByComponent(componentTerm) {
        return this._compoundIndex.find({component: componentTerm});
    }

    findConceptsByTemporal(createdAfter, createdBefore) {
        return this._temporalIndex.find({createdAfter, createdBefore});
    }

    findAtomicConcepts(name) {
        return this._atomicIndex.find({termName: name});
    }

    getMostActiveConcepts(limit, getAllConcepts) {
        return getAllConcepts()
            .filter(concept => (concept.activation || 0) > 0)
            .sort((a, b) => (b.activation || 0) - (a.activation || 0))
            .slice(0, limit);
    }

    getRecentConcepts(limit, getAllConcepts) {
        return getAllConcepts()
            .filter(concept => concept.createdAt)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, limit);
    }
}
