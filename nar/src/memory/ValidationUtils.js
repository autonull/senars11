import {Logger} from '@senars/core';

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

    startAutoValidation(callback, interval = 60000) {
        if (this._validation.validationInterval) {
            clearInterval(this._validation.validationInterval);
        }

        this._validation.autoValidation = true;
        this._validation.validationInterval = setInterval(() => {
            const result = this.validate(null, callback);
            if (callback) {callback(result);}
        }, interval);
    }

    stopAutoValidation() {
        if (this._validation.validationInterval) {
            clearInterval(this._validation.validationInterval);
            this._validation.validationInterval = null;
        }
        this._validation.autoValidation = false;
    }

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
            if (logger) {logger.error('Validation failed with exception:', error);}
        }

        results.duration = Date.now() - validationStartTime;
        this._validation.lastValidation = results;

        return results;
    }

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

    _validateConceptConsistency(concepts, termId, indexes, result) {
        concepts.forEach(concept => {
            const validator = concept.term.isAtomic
                ? this._validateAtomicConsistency
                : this._validateCompoundConsistency;

            validator.call(this, concept, termId, indexes, result);
        });
    }

    _validateAtomicConsistency(concept, termId, indexes, result) {
        const atomicIndex = indexes.atomic;
        if (!atomicIndex.has(concept.term.name)) {
            result.inconsistent++;
            result.errors.push(`Atomic concept ${termId} missing from atomic index`);
        }
    }

    _validateCompoundConsistency(concept, termId, indexes, result) {
        const compoundByOpIndex = indexes.compoundByOp;
        if (!compoundByOpIndex.has(concept.term.operator)) {
            result.inconsistent++;
            result.errors.push(`Compound concept ${termId} missing from compoundByOp index`);
        }

        const validationMap = {
            '-->': this._validateInheritanceConsistency.bind(this),
            '==>': this._validateImplicationConsistency.bind(this),
            '<->': this._validateSimilarityConsistency.bind(this)
        };

        const validator = validationMap[concept.term.operator];
        if (validator) {validator(concept, termId, indexes, result);}
    }

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

    _validateInheritanceConsistency(concept, termId, indexes, result) {
        this._validateRelationshipConsistency(concept, termId, indexes, result, 'Inheritance', 'inheritance',
            term => term.components[1]);
    }

    _validateImplicationConsistency(concept, termId, indexes, result) {
        this._validateRelationshipConsistency(concept, termId, indexes, result, 'Implication', 'implication',
            term => term.components[0]);
    }

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

    validateOrphanedEntries(indexes) {
        const result = {
            passed: true,
            warnings: [],
            checked: 0,
            orphaned: 0
        };

        try {
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

    validateDuplicates(indexes) {
        const result = {
            passed: true,
            warnings: [],
            checked: 0,
            duplicates: 0
        };

        try {
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

    validateReferences(indexes) {
        const result = {
            passed: true,
            errors: [],
            checked: 0,
            invalid: 0
        };

        try {
            const termIndex = indexes.term;

            for (const [termId, concepts] of termIndex.entries()) {
                result.checked++;
                concepts.forEach(concept => {
                    if (concept.term.isCompound && concept.term.components) {
                        concept.term.components.forEach(component => {
                            if (component.isAtomic) {
                                const atomicIndex = indexes.atomic;
                                if (!atomicIndex.has(component.name)) {
                                    result.invalid++;
                                    result.errors.push(`Invalid atomic component reference: ${component.name} in concept ${termId}`);
                                }
                            } else if (component.isCompound) {
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

    validateTermReference(term) {
        if (!term) {
            return {valid: false, reason: 'Null term reference'};
        }

        if (term.isAtomic) {
            // No way to validate atomic term existence without the index here
        } else if (term.isCompound) {
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

    validateCustomRules(indexes) {
        const result = {
            passed: true,
            errors: [],
            checked: 0,
            failed: 0
        };

        try {
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

    updateValidationHistory(results) {
        this._validation.validationResults.push(results);

        if (this._validation.validationResults.length > 50) {
            this._validation.validationResults = this._validation.validationResults.slice(-25);
        }
    }

    registerValidationRule(name, ruleFn) {
        if (typeof ruleFn !== 'function') {
            throw new Error('Validation rule must be a function');
        }

        this._validation.rules.set(name, ruleFn);
    }

    unregisterValidationRule(name) {
        return this._validation.rules.delete(name);
    }

    getValidationStats(indexes) {
        const stats = {
            totalValidations: this._validation.validationResults.length,
            lastValidation: this._validation.lastValidation,
            validationHistory: this._validation.validationResults,
            autoValidationEnabled: this._validation.autoValidation,
            customRulesCount: this._validation.rules.size
        };

        if (this._validation.validationResults.length > 0) {
            const passedCount = this._validation.validationResults.filter(r => r.passed).length;
            stats.successRate = passedCount / this._validation.validationResults.length;
        }

        return stats;
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
