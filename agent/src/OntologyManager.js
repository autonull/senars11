/**
 * Ontology management for SeNARS to constrain valid term structures and relationships
 */

export class OntologyManager {
    constructor() {
        this.types = new Set();
        this.relationships = new Set();
        this.constraints = new Set();
        this.synonyms = new Map();
        this.typeHierarchy = new Map(); // parent -> Set of children
        this.instanceOf = new Map(); // instance -> Set of types
        this.subsumption = new Map(); // subType -> Set of superTypes
    }

    /**
     * Add a type to the ontology
     */
    addType(type) {
        this.types.add(type);
        if (!this.typeHierarchy.has(type)) {
            this.typeHierarchy.set(type, new Set());
        }
    }

    /**
     * Define a relationship between types
     */
    defineRelationshipType(relationship) {
        this.relationships.add(relationship);
    }

    /**
     * Add a constraint to the ontology
     */
    addConstraint(constraint) {
        this.constraints.add(constraint);
    }

    /**
     * Add a synonym mapping
     */
    addSynonym(synonym, canonical) {
        this.synonyms.set(synonym, canonical);
    }

    /**
     * Define a type hierarchy relationship (parent -> child)
     */
    addSubtype(parentType, childType) {
        this.addType(parentType);
        this.addType(childType);

        // Add parent to child's subsumption set
        if (!this.subsumption.has(childType)) {
            this.subsumption.set(childType, new Set());
        }
        this.subsumption.get(childType).add(parentType);

        // Add child to parent's hierarchy
        if (!this.typeHierarchy.has(parentType)) {
            this.typeHierarchy.set(parentType, new Set());
        }
        this.typeHierarchy.get(parentType).add(childType);
    }

    /**
     * Check if a type exists in the ontology
     */
    hasType(type) {
        return this.types.has(type);
    }

    /**
     * Check if a relationship exists in the ontology
     */
    hasRelationship(relationship) {
        return this.relationships.has(relationship);
    }

    /**
     * Check if a constraint exists in the ontology
     */
    hasConstraint(constraint) {
        return this.constraints.has(constraint);
    }

    /**
     * Get all types in the ontology
     */
    getTypes() {
        return Array.from(this.types);
    }

    /**
     * Get all relationships in the ontology
     */
    getRelationships() {
        return Array.from(this.relationships);
    }

    /**
     * Get all constraints in the ontology
     */
    getConstraints() {
        return Array.from(this.constraints);
    }

    /**
     * Check if an instance belongs to a type (directly or through inheritance)
     */
    isInstanceOf(instance, type) {
        // Direct type check
        if (this.instanceOf.has(instance)) {
            const types = this.instanceOf.get(instance);
            if (types.has(type)) return true;

            // Check through type hierarchy
            for (const instanceType of types) {
                if (this.subsumes(instanceType, type)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Check if a type subsumes another type (typeA is a supertype of typeB)
     */
    subsumes(subtype, supertype) {
        if (subtype === supertype) return true;

        const superTypes = this.subsumption.get(subtype);
        if (!superTypes) return false;

        // Direct supertype
        if (superTypes.has(supertype)) return true;

        // Check through hierarchy
        for (const immediateSuper of superTypes) {
            if (this.subsumes(immediateSuper, supertype)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Register that an instance belongs to a type
     */
    registerInstance(instance, type) {
        if (!this.hasType(type)) {
            throw new Error(`Type ${type} not defined in ontology`);
        }

        if (!this.instanceOf.has(instance)) {
            this.instanceOf.set(instance, new Set());
        }
        this.instanceOf.get(instance).add(type);
    }

    /**
     * Validate a term against the ontology
     */
    validateTerm(term) {
        // This would check if a term structure is valid according to the ontology
        // For example, checking if relationships are defined, types are valid, etc.
        // This is a simplified version - in a full implementation it would check
        // term structures against the defined types and relationships

        if (typeof term === 'string') {
            // Check if it's a defined type
            if (this.hasType(term)) {
                return true;
            }

            // Check for relationship patterns like "subject-predicate-object"
            // This is a simplified example - could be expanded based on Narsese syntax
            const parts = term.split('-');
            if (parts.length === 3) {
                const [subject, predicate, object] = parts;

                // Check if predicate is a known relationship
                if (this.hasRelationship(predicate)) {
                    return true; // Simplified check
                }
            }
        }

        // For more complex terms (objects, arrays, etc.)
        if (typeof term === 'object' && term !== null) {
            // Implement more sophisticated validation based on SeNARS term structure
            return true; // Placeholder for now
        }

        return false;
    }

    /**
     * Get all subtypes of a given type
     */
    getSubtypes(type) {
        return Array.from(this.typeHierarchy.get(type) || []);
    }

    /**
     * Get all supertypes of a given type
     */
    getSupertypes(type) {
        return Array.from(this.subsumption.get(type) || []);
    }

    /**
     * Clear the entire ontology
     */
    clear() {
        this.types.clear();
        this.relationships.clear();
        this.constraints.clear();
        this.synonyms.clear();
        this.typeHierarchy.clear();
        this.instanceOf.clear();
        this.subsumption.clear();
    }

    /**
     * Export the ontology state
     */
    exportState() {
        return {
            types: Array.from(this.types),
            relationships: Array.from(this.relationships),
            constraints: Array.from(this.constraints),
            synonyms: Object.fromEntries(this.synonyms),
            typeHierarchy: Object.fromEntries(
                Array.from(this.typeHierarchy.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
            instanceOf: Object.fromEntries(
                Array.from(this.instanceOf.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
            subsumption: Object.fromEntries(
                Array.from(this.subsumption.entries()).map(([k, v]) => [k, Array.from(v)])
            )
        };
    }

    /**
     * Import ontology state
     */
    importState(state) {
        this.clear();

        state.types.forEach(type => this.addType(type));
        state.relationships.forEach(relationship => this.defineRelationshipType(relationship));
        state.constraints.forEach(constraint => this.addConstraint(constraint));

        Object.entries(state.synonyms).forEach(([synonym, canonical]) => {
            this.addSynonym(synonym, canonical);
        });

        Object.entries(state.typeHierarchy).forEach(([parent, children]) => {
            children.forEach(child => {
                // Rebuild the hierarchy properly
                if (!this.typeHierarchy.has(parent)) {
                    this.typeHierarchy.set(parent, new Set());
                }
                this.typeHierarchy.get(parent).add(child);
            });
        });

        Object.entries(state.instanceOf).forEach(([instance, types]) => {
            this.instanceOf.set(instance, new Set(types));
        });

        Object.entries(state.subsumption).forEach(([subtype, supertypes]) => {
            this.subsumption.set(subtype, new Set(supertypes));
        });
    }
}

// Export a default instance for convenience
export default new OntologyManager();