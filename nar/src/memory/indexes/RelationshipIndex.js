import {BaseIndex} from './BaseIndex.js';

export class RelationshipIndex extends BaseIndex {
    constructor(config = {}) {
        super(config);
        this._inheritanceIndex = new Map(); // Maps inheritance relationships
        this._implicationIndex = new Map(); // Maps implication relationships  
        this._similarityIndex = new Map(); // Maps similarity relationships

        // Index operations mapping to simplify code
        this._indexOperations = {
            '-->': (term, concept) => this._indexInheritance(term, concept),
            '==>': (term, concept) => this._indexImplication(term, concept),
            '<->': (term, concept) => this._indexSimilarity(term, concept)
        };

        // Remove operations mapping
        this._removeOperations = {
            '-->': (term, concept) => this._removeInheritance(term, concept),
            '==>': (term, concept) => this._removeImplication(term, concept),
            '<->': (term, concept) => this._removeSimilarity(term, concept)
        };

        // Find operations mapping
        this._findOperations = {
            'inheritance': (filters) => this._findInheritance(filters),
            'implication': (filters) => this._findImplication(filters),
            'similarity': (filters) => this._findSimilarity(filters)
        };
    }

    add(concept) {
        const {term} = concept;
        if (!term.isAtomic && term.operator) {
            const operation = this._indexOperations[term.operator];
            if (operation) operation(term, concept);
        }
    }

    _indexInheritance(term, concept) {
        // Index concept where this term is subject or predicate
        // For (A-->B), A is subject, B is predicate
        if (term.components && term.components.length >= 2) {
            const [subject, predicate] = term.components;
            this._addToIndex(this._inheritanceIndex, `subject:${subject.toString()}`, concept);
            this._addToIndex(this._inheritanceIndex, `predicate:${predicate.toString()}`, concept);
        }
    }

    _indexImplication(term, concept) {
        if (term.components && term.components.length >= 2) {
            const [premise, conclusion] = term.components;
            this._addToIndex(this._implicationIndex, `premise:${premise.toString()}`, concept);
            this._addToIndex(this._implicationIndex, `conclusion:${conclusion.toString()}`, concept);
        }
    }

    _indexSimilarity(term, concept) {
        if (term.components && term.components.length >= 2) {
            const [first, second] = term.components;
            this._addToIndex(this._similarityIndex, `similar:${first.toString()}`, concept);
            this._addToIndex(this._similarityIndex, `similar:${second.toString()}`, concept);
        }
    }

    _addToIndex(index, key, concept) {
        if (!index.has(key)) {
            index.set(key, new Set());
        }
        index.get(key).add(concept);
    }

    remove(concept) {
        const {term} = concept;
        if (!term.isAtomic && term.operator) {
            const operation = this._removeOperations[term.operator];
            if (operation) operation(term, concept);
        }
    }

    _removeInheritance(term, concept) {
        if (term.components && term.components.length >= 2) {
            const [subject, predicate] = term.components;
            this._removeFromIndex(this._inheritanceIndex, `subject:${subject.toString()}`, concept);
            this._removeFromIndex(this._inheritanceIndex, `predicate:${predicate.toString()}`, concept);
        }
    }

    _removeImplication(term, concept) {
        if (term.components && term.components.length >= 2) {
            const [premise, conclusion] = term.components;
            this._removeFromIndex(this._implicationIndex, `premise:${premise.toString()}`, concept);
            this._removeFromIndex(this._implicationIndex, `conclusion:${conclusion.toString()}`, concept);
        }
    }

    _removeSimilarity(term, concept) {
        if (term.components && term.components.length >= 2) {
            const [first, second] = term.components;
            this._removeFromIndex(this._similarityIndex, `similar:${first.toString()}`, concept);
            this._removeFromIndex(this._similarityIndex, `similar:${second.toString()}`, concept);
        }
    }

    _removeFromIndex(index, key, concept) {
        if (index.has(key)) {
            const concepts = index.get(key);
            concepts.delete(concept);
            if (concepts.size === 0) {
                index.delete(key);
            }
        }
    }

    find(filters = {}) {
        const {relationshipType} = filters;

        if (relationshipType) {
            const operation = this._findOperations[relationshipType];
            if (operation) {
                return operation(filters);
            }
        }

        return this.getAll();
    }

    _findInheritance(filters) {
        const {subject, predicate} = filters;
        const result = [];

        if (subject) {
            const concepts = this._inheritanceIndex.get(`subject:${subject.toString()}`);
            if (concepts) result.push(...Array.from(concepts));
        }
        if (predicate) {
            const concepts = this._inheritanceIndex.get(`predicate:${predicate.toString()}`);
            if (concepts) result.push(...Array.from(concepts));
        }

        return result;
    }

    _findImplication(filters) {
        const {premise, conclusion} = filters;
        const result = [];

        if (premise) {
            const concepts = this._implicationIndex.get(`premise:${premise.toString()}`);
            if (concepts) result.push(...Array.from(concepts));
        }
        if (conclusion) {
            const concepts = this._implicationIndex.get(`conclusion:${conclusion.toString()}`);
            if (concepts) result.push(...Array.from(concepts));
        }

        return result;
    }

    _findSimilarity(filters) {
        const {term} = filters;
        const result = [];

        if (term) {
            const concepts = this._similarityIndex.get(`similar:${term.toString()}`);
            if (concepts) result.push(...Array.from(concepts));
        }

        return result;
    }

    clear() {
        this._inheritanceIndex.clear();
        this._implicationIndex.clear();
        this._similarityIndex.clear();
    }

    getAll() {
        const allConcepts = new Set();
        const indexes = [this._inheritanceIndex, this._implicationIndex, this._similarityIndex];

        for (const index of indexes) {
            for (const concepts of index.values()) {
                for (const concept of concepts) {
                    allConcepts.add(concept);
                }
            }
        }

        return Array.from(allConcepts);
    }
}