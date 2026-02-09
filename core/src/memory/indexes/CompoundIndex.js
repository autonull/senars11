import {BaseIndex} from './BaseIndex.js';
import {TermCategorization} from '../TermCategorization.js';
import {addToMapSet} from '../MemoryUtils.js';

export class CompoundIndex extends BaseIndex {
    constructor(config = {}) {
        super(config);
        this._index = new Map(); // Maps operator to concepts
        this._complexityIndex = new Map(); // Maps complexity level to concepts
        this._categoryIndex = new Map(); // Maps category to concepts
        this._componentIndex = new Map(); // Maps components to concepts
    }

    add(concept) {
        const {term} = concept;
        if (!term.isAtomic) {
            // Index by operator, complexity, category, and components
            addToMapSet(this._index, term.operator, concept);
            addToMapSet(this._complexityIndex, this._getComplexityLevel(term), concept);
            addToMapSet(this._categoryIndex, TermCategorization.getTermCategory(term), concept);

            // Index by components (with nested indexing if needed)
            this._indexComponents(term.components, concept);
        }
    }

    _indexComponents(components, concept) {
        if (components) {
            for (const comp of components) {
                addToMapSet(this._componentIndex, comp, concept);

                // Also index nested components
                if (comp.isCompound) {
                    this._indexCompoundRecursively(comp, concept);
                }
            }
        }
    }

    _indexCompoundRecursively(term, concept) {
        if (term.components) {
            for (const comp of term.components) {
                addToMapSet(this._componentIndex, comp, concept);

                if (comp.isCompound) {
                    this._indexCompoundRecursively(comp, concept);
                }
            }
        }
    }

    remove(concept) {
        const {term} = concept;
        if (!term.isAtomic) {
            // Remove from all indexes
            this._removeFromIndex(this._index, term.operator, concept);
            this._removeFromIndex(this._complexityIndex, this._getComplexityLevel(term), concept);
            this._removeFromIndex(this._categoryIndex, TermCategorization.getTermCategory(term), concept);

            // Remove from component index
            this._removeFromComponentIndex(term.components, concept);
        }
    }

    _removeFromComponentIndex(components, concept) {
        if (components) {
            for (const comp of components) {
                this._removeFromIndex(this._componentIndex, comp, concept);

                // Also remove from nested components
                if (comp.isCompound && comp.components) {
                    this._removeFromComponentIndex(comp.components, concept);
                }
            }
        }
    }

    _getComplexityLevel(term) {
        const complexity = TermCategorization.getTermComplexity(term);
        // Simplified complexity level calculation - would need full config implementation
        return Math.floor(complexity / 10); // Using 10 as bucket size
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
        const {operator, category, minComplexity, maxComplexity, component} = filters;
        let candidates = null;

        if (operator !== undefined) {
            const matches = this._index.get(operator);
            if (!matches || matches.size === 0) return [];
            candidates = new Set(matches);
        }

        if (category !== undefined) {
            const matches = this._categoryIndex.get(category);
            if (!matches || matches.size === 0) return [];

            if (candidates === null) {
                candidates = new Set(matches);
            } else {
                const intersection = new Set();
                for (const c of candidates) {
                    if (matches.has(c)) intersection.add(c);
                }
                candidates = intersection;
                if (candidates.size === 0) return [];
            }
        }

        if (component !== undefined) {
            const matches = this._componentIndex.get(component);
            if (!matches || matches.size === 0) return [];

            if (candidates === null) {
                candidates = new Set(matches);
            } else {
                const intersection = new Set();
                for (const c of candidates) {
                    if (matches.has(c)) intersection.add(c);
                }
                candidates = intersection;
                if (candidates.size === 0) return [];
            }
        }

        if (minComplexity !== undefined || maxComplexity !== undefined) {
            const matches = this._getConceptsByComplexityRange(minComplexity, maxComplexity);
            if (matches.length === 0) return [];

            if (candidates === null) {
                candidates = new Set(matches);
            } else {
                const matchesSet = new Set(matches);
                const intersection = new Set();
                for (const c of candidates) {
                    if (matchesSet.has(c)) intersection.add(c);
                }
                candidates = intersection;
                if (candidates.size === 0) return [];
            }
        }

        return candidates ? Array.from(candidates) : this.getAll();
    }

    _getConceptsByComplexityRange(minComplexity, maxComplexity) {
        const result = [];
        for (const [level, concepts] of this._complexityIndex.entries()) {
            // Convert level back to complexity and check range
            if ((minComplexity === undefined || level >= minComplexity) &&
                (maxComplexity === undefined || level <= maxComplexity)) {
                result.push(...Array.from(concepts));
            }
        }
        return result;
    }

    clear() {
        this._index.clear();
        this._complexityIndex.clear();
        this._categoryIndex.clear();
        this._componentIndex.clear();
    }

    getAll() {
        const allConcepts = new Set();
        const indexes = [this._index, this._complexityIndex, this._categoryIndex, this._componentIndex];

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