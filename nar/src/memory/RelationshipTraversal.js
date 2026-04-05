export class RelationshipTraversal {
    constructor(relationshipIndex) {
        this._relationshipIndex = relationshipIndex;
    }

    findRelatedConceptsExtended(term, options = {}) {
        const {
            relationshipTypes = ['inheritance', 'implication', 'similarity'],
            maxDepth = 3,
            includeIndirect = true
        } = options;

        const relatedConcepts = new Set();
        const visitedTerms = new Set();

        const traverseRelationships = (currentTerm, depth) => {
            if (depth > maxDepth || visitedTerms.has(currentTerm.toString())) {return;}
            visitedTerms.add(currentTerm.toString());

            for (const relType of relationshipTypes) {
                const query = this._createQueryForRelationship(relType, currentTerm);
                const concepts = this._relationshipIndex.find(query);
                concepts.forEach(c => relatedConcepts.add(c));
            }

            if (includeIndirect && depth < maxDepth) {
                for (const concept of relatedConcepts) {
                    if (concept.term) {traverseRelationships(concept.term, depth + 1);}
                }
            }
        };

        traverseRelationships(term, 0);
        return Array.from(relatedConcepts);
    }

    _createQueryForRelationship(relType, currentTerm) {
        const queries = {
            'inheritance': {relationshipType: relType, subject: currentTerm},
            'implication': {relationshipType: relType, premise: currentTerm},
            'similarity': {relationshipType: relType}
        };
        return queries[relType] || {relationshipType: relType};
    }

    findInheritanceConcepts(term) {
        return this._relationshipIndex.find({
            relationshipType: 'inheritance',
            subject: term,
            predicate: term
        });
    }

    findImplicationConcepts(term) {
        return this._relationshipIndex.find({
            relationshipType: 'implication',
            premise: term,
            conclusion: term
        });
    }

    findSimilarityConcepts(term) {
        return this._relationshipIndex.find({
            relationshipType: 'similarity',
            term
        });
    }

    findRelationshipConcepts(relationshipType, additionalCriteria = {}) {
        return this._relationshipIndex.find({relationshipType, ...additionalCriteria});
    }
}
