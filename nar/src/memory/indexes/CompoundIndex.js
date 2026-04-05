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
        const concepts = index.get(key);
        if (!concepts?.size) {return;}
        concepts.delete(concept);
        if (concepts.size === 0) {index.delete(key);}
    }

    find(filters = {}) {
        const {operator, category, minComplexity, maxComplexity, component} = filters;
        let candidates = null;

        const filterSets = [
            operator !== undefined && this._index.get(operator),
            category !== undefined && this._categoryIndex.get(category),
            component !== undefined && this._componentIndex.get(component)
        ].filter(Boolean);

        for (const matches of filterSets) {
            if (matches.size === 0) {return [];}
            candidates = candidates ? this._intersectSets(candidates, matches) : new Set(matches);
            if (candidates.size === 0) {return [];}
        }

        if (minComplexity !== undefined || maxComplexity !== undefined) {
            const matches = this._getConceptsByComplexityRange(minComplexity, maxComplexity);
            if (matches.length === 0) {return [];}
            candidates = candidates ? this._intersectSetWithArray(candidates, matches) : new Set(matches);
            if (candidates.size === 0) {return [];}
        }

        return candidates ? Array.from(candidates) : this.getAll();
    }

    _intersectSets(a, b) {
        const result = new Set();
        for (const item of a) {if (b.has(item)) {result.add(item);}}
        return result;
    }

    _intersectSetWithArray(set, arr) {
        const arrSet = new Set(arr);
        const result = new Set();
        for (const item of set) {if (arrSet.has(item)) {result.add(item);}}
        return result;
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