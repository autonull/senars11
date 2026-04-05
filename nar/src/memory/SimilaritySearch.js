import {TermCategorization} from './TermCategorization.js';

export class SimilaritySearch {
    constructor(compoundIndex) {
        this._compoundIndex = compoundIndex;
    }

    findRelatedConcepts(term, searchOptions = {}, getAllConcepts) {
        const {
            maxResults = 10,
            includeCategories = [],
            excludeCategories = [],
            minActivation = 0,
            useSemanticSimilarity = true,
            searchDepth = 2
        } = searchOptions;

        const results = new Map();

        if (term.components) {
            for (const comp of term.components) {
                const byComponent = this._compoundIndex.find({component: comp});
                for (const concept of byComponent) {
                    if (this._shouldSkipConcept(concept, excludeCategories, includeCategories, minActivation)) {continue;}
                    const relevance = this._calculateStructuralSimilarity(term, concept.term);
                    results.set(concept, {relevance, method: 'component'});
                }
            }
        }

        const category = TermCategorization.getTermCategory(term);
        if (!excludeCategories.includes(category) &&
            (includeCategories.length === 0 || includeCategories.includes(category))) {
            const byCategory = this._compoundIndex.find({category});
            for (const concept of byCategory) {
                if (results.has(concept)) {continue;}
                if (concept.activation < minActivation) {continue;}
                const relevance = this._calculateStructuralSimilarity(term, concept.term);
                results.set(concept, {relevance, method: 'category'});
            }
        }

        if (useSemanticSimilarity) {
            const semanticallySimilar = this._findSemanticallySimilarConcepts(term, searchDepth, getAllConcepts);
            for (const [concept, score] of semanticallySimilar.entries()) {
                if (results.has(concept)) {continue;}
                if (concept.activation < minActivation) {continue;}
                const category = TermCategorization.getTermCategory(concept.term);
                if (excludeCategories.includes(category)) {continue;}
                if (includeCategories.length > 0 && !includeCategories.includes(category)) {continue;}
                results.set(concept, {relevance: score, method: 'semantic'});
            }
        }

        return Array.from(results.entries())
            .sort((a, b) => b[1].relevance - a[1].relevance)
            .slice(0, maxResults)
            .map(item => item[0]);
    }

    _shouldSkipConcept(concept, excludeCategories, includeCategories, minActivation) {
        const category = TermCategorization.getTermCategory(concept.term);
        return excludeCategories.includes(category) ||
            (includeCategories.length > 0 && !includeCategories.includes(category)) ||
            concept.activation < minActivation;
    }

    _findSemanticallySimilarConcepts(term, depth, getAllConcepts) {
        const results = new Map();
        const category = TermCategorization.getTermCategory(term);
        const sameCategoryConcepts = this._compoundIndex.find({category});

        for (const concept of sameCategoryConcepts) {
            if (concept.term === term) {continue;}
            const similarityScore = this._calculateStructuralSimilarity(term, concept.term);
            if (similarityScore > 0.1) {results.set(concept, similarityScore);}
        }
        return results;
    }

    _calculateStructuralSimilarity(term1, term2) {
        if (!term1 || !term2) {return 0;}
        if (!term1.operator && !term2.operator) {
            return term1.name === term2.name ? 1.0 : 0.1;
        }
        if (term1.components && term2.components) {
            const comps1 = new Set(term1.components.map(c => c.name));
            const comps2 = new Set(term2.components.map(c => c.name));
            let intersection = 0;
            for (const c of comps1) {
                if (comps2.has(c)) {intersection++;}
            }
            const union = comps1.size + comps2.size - intersection;
            return union > 0 ? intersection / union : 0;
        }
        return 0.1;
    }

    calculateRelevanceScore(queryTerm, conceptTerm) {
        if (queryTerm.toString() === conceptTerm.toString()) {return 1.0;}
        let score = 0;
        if (queryTerm.operator && conceptTerm.operator === queryTerm.operator) {score += 0.3;}
        if (queryTerm.components && conceptTerm.components) {
            const queryComponents = new Set(queryTerm.components.map(c => c.toString()));
            const conceptComponents = new Set(conceptTerm.components.map(c => c.toString()));
            const intersection = [...queryComponents].filter(x => conceptComponents.has(x)).length;
            const union = new Set([...queryComponents, ...conceptComponents]).size;
            if (union > 0) {score += 0.5 * (intersection / union);}
        }
        if (queryTerm.name && conceptTerm.name) {
            const queryName = queryTerm.name.toLowerCase();
            const conceptName = conceptTerm.name.toLowerCase();
            if (queryName === conceptName) {score += 0.4;}
            else if (queryName.includes(conceptName) || conceptName.includes(queryName)) {score += 0.2;}
        }
        return Math.min(1.0, score);
    }
}
