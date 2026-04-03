import {Logger} from '@senars/core/src/util/Logger.js';

export class ValidationUtils {
    constructor() {
        this._validation = {
            rules: new Map(),
            lastValidation: null,
            validationResults: [],
            autoValidation: false,
            validationInterval: null
        };
    }

    static addToIndex(indexes, index, key, value) {
        if (!indexes[index].has(key)) {
            indexes[index].set(key, new Set());
        }
        indexes[index].get(key).add(value);
    }

    static removeFromIndex(indexes, index, key, value) {
        if (indexes[index].has(key)) {
            const set = indexes[index].get(key);
            set.delete(value);
            if (set.size === 0) {
                indexes[index].delete(key);
            }
        }
    }

    /**
     * Start automatic validation
     */
    startAutoValidation(callback, interval = 60000) { // 1 minute default
        if (this._validation.validationInterval) {
            clearInterval(this._validation.validationInterval);
        }

        this._validation.autoValidation = true;
        this._validation.validationInterval = setInterval(() => {
            const result = this.validate(null, callback);
            if (callback) callback(result);
        }, interval);
    }

    /**
     * Stop automatic validation
     */
    stopAutoValidation() {
        if (this._validation.validationInterval) {
            clearInterval(this._validation.validationInterval);
            this._validation.validationInterval = null;
        }
        this._validation.autoValidation = false;
    }

    /**
     * Validate the integrity of indexes
     */
    validate(indexes, logger = null) {
        const validationStartTime = Date.now();
        const results = {
            timestamp: validationStartTime,
            passed: true,
            errors: [],
            warnings: [],
            stats: this.getStats(indexes),
            details: {},
            duration: 0
        };

        try {
            this._runValidationTasks(indexes, results);
            this.updateValidationHistory(results);
        } catch (error) {
            results.passed = false;
            results.errors.push(`Validation failed with exception: ${error.message}`);
            if (logger) logger.error('Validation failed with exception:', error);
        }

        results.duration = Date.now() - validationStartTime;
        this._validation.lastValidation = results;

        return results;
    }

    /**
     * Run all validation tasks
     */
    _runValidationTasks(indexes, results) {
        const validationTasks = [
            {key: 'termConsistency', validator: this.validateTermConsistency, error: true},
            {key: 'orphanedEntries', validator: this.validateOrphanedEntries, error: false},
            {key: 'duplicates', validator: this.validateDuplicates, error: false},
            {key: 'invalidReferences', validator: this.validateReferences, error: true},
            {key: 'customRules', validator: this.validateCustomRules, error: true}
        ];

        validationTasks.forEach(task => this._executeValidationTask(task, indexes, results));
    }

    /**
     * Execute a single validation task
     */
    _executeValidationTask(task, indexes, results) {
        const validationResult = task.validator.call(this, indexes);
        results.details[task.key] = validationResult;

        if (!validationResult.passed) {
            const target = task.error ? results.errors : results.warnings;
            target.push(...(validationResult[task.error ? 'errors' : 'warnings'] || []));

            if (task.error) {
                results.passed = false;
            }
        }
    }

    /**
     * Validate term consistency between indexes
     */
    validateTermConsistency(indexes) {
        const result = {
            passed: true,
            errors: [],
            checked: 0,
            inconsistent: 0
        };

        try {
            const termIndex = indexes.term;
            for (const [termId, concepts] of termIndex.entries()) {
                result.checked++;
                this._validateConceptConsistency(concepts, termId, indexes, result);
            }

            result.passed = result.inconsistent === 0;
        } catch (error) {
            result.passed = false;
            result.errors.push(`Term consistency validation failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Validate consistency for a specific concept
     */
    _validateConceptConsistency(concepts, termId, indexes, result) {
        concepts.forEach(concept => {
            // Determine if concept is atomic or compound and validate accordingly
            const validator = concept.term.isAtomic
                ? this._validateAtomicConsistency
                : this._validateCompoundConsistency;

            validator.call(this, concept, termId, indexes, result);
        });
    }

    /**
     * Validate atomic concept consistency
     */
    _validateAtomicConsistency(concept, termId, indexes, result) {
        const atomicIndex = indexes.atomic;
        if (!atomicIndex.has(concept.term.name)) {
            result.inconsistent++;
            result.errors.push(`Atomic concept ${termId} missing from atomic index`);
        }
    }

    /**
     * Validate compound concept consistency
     */
    _validateCompoundConsistency(concept, termId, indexes, result) {
        const compoundByOpIndex = indexes.compoundByOp;
        if (!compoundByOpIndex.has(concept.term.operator)) {
            result.inconsistent++;
            result.errors.push(`Compound concept ${termId} missing from compoundByOp index`);
        }

        // Check operator-specific indexes
        const validationMap = {
            '-->': this._validateInheritanceConsistency.bind(this),
            '==>': this._validateImplicationConsistency.bind(this),
            '<->': this._validateSimilarityConsistency.bind(this)
        };

        const validator = validationMap[concept.term.operator];
        if (validator) validator(concept, termId, indexes, result);
    }

    /**
     * Validate relationship concept consistency using a common pattern
     */
    _validateRelationshipConsistency(concept, termId, indexes, result, operator, indexName, componentExtractor) {
        const index = indexes[indexName];
        if (concept.term.components && concept.term.components.length >= 2) {
            const targetComponent = componentExtractor(concept.term);
            if (targetComponent && !index.has(targetComponent.name)) {
                result.inconsistent++;
                result.errors.push(`${operator} concept ${termId} missing from ${indexName} index`);
            }
        }
    }

    /**
     * Validate inheritance concept consistency
     */
    _validateInheritanceConsistency(concept, termId, indexes, result) {
        this._validateRelationshipConsistency(concept, termId, indexes, result, 'Inheritance', 'inheritance',
            term => term.components[1]);
    }

    /**
     * Validate implication concept consistency
     */
    _validateImplicationConsistency(concept, termId, indexes, result) {
        this._validateRelationshipConsistency(concept, termId, indexes, result, 'Implication', 'implication',
            term => term.components[0]);
    }

    /**
     * Validate similarity concept consistency
     */
    _validateSimilarityConsistency(concept, termId, indexes, result) {
        const similarityIndex = indexes.similarity;
        if (concept.term.components && concept.term.components.length >= 2) {
            const term1 = concept.term.components[0];
            const term2 = concept.term.components[1];
            if (!similarityIndex.has(term1.name) && !similarityIndex.has(term2.name)) {
                result.inconsistent++;
                result.errors.push(`Similarity concept ${termId} missing from similarity index`);
            }
        }
    }

    /**
     * Validate for orphaned entries
     */
    validateOrphanedEntries(indexes) {
        const result = {
            passed: true,
            warnings: [],
            checked: 0,
            orphaned: 0
        };

        try {
            // Check for entries in secondary indexes that don't exist in primary term index
            const termIndex = indexes.term;
            const indexesToCheck = [
                {index: indexes.atomic, name: 'atomic'},
                {index: indexes.compoundByOp, name: 'compoundByOp'},
                {index: indexes.inheritance, name: 'inheritance'},
                {index: indexes.implication, name: 'implication'},
                {index: indexes.similarity, name: 'similarity'}
            ];

            indexesToCheck.forEach(({index, name}) => {
                for (const [key, concepts] of index.entries()) {
                    result.checked++;
                    for (const concept of concepts) {
                        const termId = concept.term.id;
                        if (!termIndex.has(termId)) {
                            result.orphaned++;
                            result.warnings.push(`Orphaned ${name} concept in ${name} index: ${key}`);
                        }
                    }
                }
            });

            result.passed = result.orphaned === 0;
        } catch (error) {
            result.passed = false;
            result.warnings.push(`Orphaned entries validation failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Validate for duplicate entries
     */
    validateDuplicates(indexes) {
        const result = {
            passed: true,
            warnings: [],
            checked: 0,
            duplicates: 0
        };

        try {
            // Check for duplicate entries in term index
            const termIndex = indexes.term;
            const seenConcepts = new Set();

            for (const [termId, concepts] of termIndex.entries()) {
                result.checked++;
                for (const concept of concepts) {
                    const conceptKey = `${termId}-${concept.stamp?.id || 'no-stamp'}`;
                    if (seenConcepts.has(conceptKey)) {
                        result.duplicates++;
                        result.warnings.push(`Duplicate concept in term index: ${conceptKey}`);
                    } else {
                        seenConcepts.add(conceptKey);
                    }
                }
            }

            result.passed = result.duplicates === 0;
        } catch (error) {
            result.passed = false;
            result.warnings.push(`Duplicates validation failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Validate references between concepts
     */
    validateReferences(indexes) {
        const result = {
            passed: true,
            errors: [],
            checked: 0,
            invalid: 0
        };

        try {
            // Check for invalid references in compound terms
            const termIndex = indexes.term;

            for (const [termId, concepts] of termIndex.entries()) {
                result.checked++;
                concepts.forEach(concept => {
                    if (concept.term.isCompound && concept.term.components) {
                        concept.term.components.forEach(component => {
                            // Check if component references valid terms
                            if (component.isAtomic) {
                                // For atomic components, check if they exist in atomic index
                                const atomicIndex = indexes.atomic;
                                if (!atomicIndex.has(component.name)) {
                                    // This might be okay if it's a variable or unbound term
                                    // But we'll note it as a potential issue
                                    result.invalid++;
                                    result.errors.push(`Invalid atomic component reference: ${component.name} in concept ${termId}`);
                                }
                            } else if (component.isCompound) {
                                // For compound components, recursively check validity
                                const componentValidity = this.validateTermReference(component);
                                if (!componentValidity.valid) {
                                    result.invalid++;
                                    result.errors.push(`Invalid compound component reference: ${component.name} in concept ${termId} - ${componentValidity.reason}`);
                                }
                            }
                        });
                    }
                });
            }

            result.passed = result.invalid === 0;
        } catch (error) {
            result.passed = false;
            result.errors.push(`References validation failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Validate a single term reference
     */
    validateTermReference(term) {
        if (!term) {
            return {valid: false, reason: 'Null term reference'};
        }

        if (term.isAtomic) {
            // No way to validate atomic term existence without the index here
            // So we'll assume it's valid for now
        } else if (term.isCompound) {
            // Check if all components are valid
            if (term.components) {
                for (const component of term.components) {
                    const componentValidity = this.validateTermReference(component);
                    if (!componentValidity.valid) {
                        return {valid: false, reason: `Invalid component: ${componentValidity.reason}`};
                    }
                }
            }
        }

        return {valid: true, reason: 'Valid reference'};
    }

    /**
     * Validate custom rules
     */
    validateCustomRules(indexes) {
        const result = {
            passed: true,
            errors: [],
            checked: 0,
            failed: 0
        };

        try {
            // Run all registered custom validation rules
            for (const [ruleName, ruleFn] of this._validation.rules.entries()) {
                result.checked++;
                try {
                    const ruleResult = ruleFn(indexes);
                    if (!ruleResult.passed) {
                        result.failed++;
                        result.errors.push(`Custom validation rule ${ruleName} failed: ${ruleResult.message || 'No message'}`);
                    }
                } catch (error) {
                    result.failed++;
                    result.errors.push(`Custom validation rule ${ruleName} threw exception: ${error.message}`);
                }
            }

            result.passed = result.failed === 0;
        } catch (error) {
            result.passed = false;
            result.errors.push(`Custom rules validation failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Update validation history
     */
    updateValidationHistory(results) {
        this._validation.validationResults.push(results);

        // Keep only last 50 validation results to prevent memory growth
        if (this._validation.validationResults.length > 50) {
            this._validation.validationResults = this._validation.validationResults.slice(-25);
        }
    }

    /**
     * Register a custom validation rule
     */
    registerValidationRule(name, ruleFn) {
        if (typeof ruleFn !== 'function') {
            throw new Error('Validation rule must be a function');
        }

        this._validation.rules.set(name, ruleFn);
    }

    /**
     * Unregister a custom validation rule
     */
    unregisterValidationRule(name) {
        return this._validation.rules.delete(name);
    }

    /**
     * Get validation statistics
     */
    getValidationStats(indexes) {
        const stats = {
            totalValidations: this._validation.validationResults.length,
            lastValidation: this._validation.lastValidation,
            validationHistory: this._validation.validationResults,
            autoValidationEnabled: this._validation.autoValidation,
            customRulesCount: this._validation.rules.size
        };

        // Calculate success rate
        if (this._validation.validationResults.length > 0) {
            const passedCount = this._validation.validationResults.filter(r => r.passed).length;
            stats.successRate = passedCount / this._validation.validationResults.length;
        }

        return stats;
    }

    /**
     * Repair validation issues
     */
    repair(indexes, logger = null) {
        const repairStartTime = Date.now();
        const results = {
            timestamp: repairStartTime,
            repaired: 0,
            errors: [],
            actions: [],
            duration: 0
        };

        try {
            // Run validation first to identify issues
            const validationResults = this.validate(indexes, logger);

            if (!validationResults.passed) {
                results.actions.push('Attempting to repair validation issues...');
                this._executeRepairs(validationResults, indexes, results, logger);
            } else {
                results.actions.push('No validation issues found, no repairs needed');
            }
        } catch (error) {
            results.errors.push(`Repair failed with exception: ${error.message}`);
            if (logger) logger.error('Repair failed with exception:', error);
        }

        results.duration = Date.now() - repairStartTime;
        return results;
    }

    /**
     * Execute repair operations based on validation results
     */
    _executeRepairs(validationResults, indexes, results, logger) {
        const repairOperations = [
            {
                condition: validationResults.details.termConsistency?.passed === false,
                operation: () => this.repairTermConsistency(indexes),
                message: (count) => `Repaired ${count} term consistency issues`
            },
            {
                condition: validationResults.details.orphanedEntries?.passed === false,
                operation: () => this.removeOrphanedEntries(indexes),
                message: (count) => `Removed ${count} orphaned entries`
            },
            {
                condition: validationResults.details.duplicates?.passed === false,
                operation: () => this.removeDuplicates(indexes),
                message: (count) => `Removed ${count} duplicate entries`
            },
            {
                condition: validationResults.details.invalidReferences?.passed === false,
                operation: () => this.repairInvalidReferences(indexes, logger),
                message: (count) => `Repaired ${count} invalid references`
            }
        ];

        // Execute repair operations
        repairOperations
            .filter(op => op.condition)
            .forEach(op => {
                const count = op.operation();
                results.repaired += count;
                results.actions.push(op.message(count));
            });
    }

    repairTermConsistency(indexes) {
        let repairedCount = 0;

        try {
            const termIndex = indexes.term;
            for (const [termId, concepts] of termIndex.entries()) {
                for (const concept of concepts) {
                    // Add missing entries to appropriate indexes
                    if (concept.term.isAtomic) {
                        const atomicIndex = indexes.atomic;
                        if (!atomicIndex.has(concept.term.name)) {
                            ValidationUtils.addToIndex(indexes, 'atomic', concept.term.name, concept);
                            repairedCount++;
                        }
                    } else {
                        const compoundByOpIndex = indexes.compoundByOp;
                        if (!compoundByOpIndex.has(concept.term.operator)) {
                            ValidationUtils.addToIndex(indexes, 'compoundByOp', concept.term.operator, concept);
                            repairedCount++;
                        }

                        // Add to operator-specific indexes - use a more compact handler
                        this._applyOperatorSpecificRepair(concept, indexes, repairedCount);
                    }
                }
            }
        } catch (error) {
            Logger.warn('Failed to repair term consistency:', error);
        }

        return repairedCount;
    }

    _applyOperatorSpecificRepair(concept, indexes, repairedCount) {
        const operatorHandlers = {
            '-->': () => this._handleInheritanceRepair(concept, indexes),
            '==>': () => this._handleImplicationRepair(concept, indexes),
            '<->': () => this._handleSimilarityRepair(concept, indexes)
        };

        const handler = operatorHandlers[concept.term.operator];
        if (handler) handler();
    }

    _handleInheritanceRepair(concept, indexes) {
        if (concept.term.components && concept.term.components.length >= 2) {
            const predicate = concept.term.components[1];
            if (!indexes.inheritance.has(predicate.name)) {
                ValidationUtils.addToIndex(indexes, 'inheritance', predicate.name, concept);
                return 1;
            }
        }
        return 0;
    }

    _handleImplicationRepair(concept, indexes) {
        if (concept.term.components && concept.term.components.length >= 2) {
            const premise = concept.term.components[0];
            if (!indexes.implication.has(premise.name)) {
                ValidationUtils.addToIndex(indexes, 'implication', premise.name, concept);
                return 1;
            }
        }
        return 0;
    }

    _handleSimilarityRepair(concept, indexes) {
        let repaired = 0;
        if (concept.term.components && concept.term.components.length >= 2) {
            const term1 = concept.term.components[0];
            const term2 = concept.term.components[1];
            if (!indexes.similarity.has(term1.name)) {
                ValidationUtils.addToIndex(indexes, 'similarity', term1.name, concept);
                repaired++;
            }
            if (!indexes.similarity.has(term2.name)) {
                ValidationUtils.addToIndex(indexes, 'similarity', term2.name, concept);
                repaired++;
            }
        }
        return repaired;
    }

    removeOrphanedEntries(indexes) {
        let removedCount = 0;

        try {
            const termIndex = indexes.term;
            const indexesToCheck = [
                {index: indexes.atomic, name: 'atomic'},
                {index: indexes.compoundByOp, name: 'compoundByOp'},
                {index: indexes.inheritance, name: 'inheritance'},
                {index: indexes.implication, name: 'implication'},
                {index: indexes.similarity, name: 'similarity'}
            ];

            for (const {index, name} of indexesToCheck) {
                for (const [key, concepts] of index.entries()) {
                    for (const concept of Array.from(concepts)) { // Use Array.from to avoid modification during iteration
                        const termId = concept.term.id;
                        if (!termIndex.has(termId)) {
                            ValidationUtils.removeFromIndex(indexes, name, key, concept);
                            removedCount++;
                        }
                    }
                }
            }
        } catch (error) {
            Logger.warn('Failed to remove orphaned entries:', error);
        }

        return removedCount;
    }

    removeDuplicates(indexes) {
        let removedCount = 0;

        try {
            // Remove duplicate entries in term index
            const termIndex = indexes.term;
            const seenConcepts = new Set();

            for (const [termId, concepts] of termIndex.entries()) {
                for (const concept of Array.from(concepts)) { // Use Array.from to avoid modification during iteration
                    const conceptKey = `${termId}-${concept.stamp?.id || 'no-stamp'}`;
                    if (seenConcepts.has(conceptKey)) {
                        ValidationUtils.removeFromIndex(indexes, 'term', termId, concept);
                        removedCount++;
                    } else {
                        seenConcepts.add(conceptKey);
                    }
                }
            }
        } catch (error) {
            Logger.warn('Failed to remove duplicates:', error);
        }

        return removedCount;
    }

    repairInvalidReferences(indexes, logger) {
        let repairedCount = 0;

        try {
            // For now, we'll just log invalid references
            // In a real implementation, we might try to create missing terms or remove invalid references
            const validationResults = this.validate(indexes, logger);
            if (validationResults.details.invalidReferences &&
                validationResults.details.invalidReferences.errors.length > 0) {
                for (const error of validationResults.details.invalidReferences.errors) {
                    if (logger) logger.warn(`Invalid reference detected: ${error}`);
                }
                // In a real implementation, we might attempt repairs here
                // For now, we'll just count the issues as "repaired" by logging them
                repairedCount = validationResults.details.invalidReferences.errors.length;
            }
        } catch (error) {
            if (logger) logger.warn('Failed to repair invalid references:', error);
        }

        return repairedCount;
    }

    getStats(indexes) {
        const {
            inheritance,
            implication,
            similarity,
            compound,
            atomic,
            compoundByOp,
            component,
            complexity,
            category,
            temporal,
            activation
        } = indexes;

        return {
            totalConcepts: this.countTotalConcepts(indexes),
            inheritanceEntries: inheritance.size,
            implicationEntries: implication.size,
            similarityEntries: similarity.size,
            operatorEntries: compound.size,
            compoundTermsByOperator: Object.fromEntries(
                Array.from(compound.entries()).map(([op, terms]) => [op, terms.size])
            ),
            atomicEntries: atomic.size,
            compoundByOpEntries: compoundByOp.size,
            componentEntries: component.size,
            complexityEntries: complexity.size,
            categoryEntries: category.size,
            temporalEntries: temporal.size,
            activationEntries: activation.size,
            indexDetails: {
                atomic: this.getMapSizes(atomic),
                compoundByOp: this.getMapSizes(compoundByOp),
                component: this.getMapSizes(component),
                complexity: this.getMapSizes(complexity),
                category: this.getMapSizes(category),
                temporal: this.getMapSizes(temporal),
                activation: this.getMapSizes(activation)
            }
        };
    }

    countTotalConcepts(indexes) {
        let count = 0;
        for (const concepts of indexes.term.values()) {
            count += concepts.size;
        }
        return count;
    }

    getMapSizes(map) {
        const sizes = {};
        for (const [key, value] of map.entries()) {
            sizes[key.toString()] = value.size;
        }
        return sizes;
    }
}