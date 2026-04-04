import {Logger} from '@senars/core';
import {ValidationUtils} from './ValidationUtils.js';

export class ValidationRepair {
    static repair(indexes, validationUtils, logger = null) {
        const repairStartTime = Date.now();
        const results = {
            timestamp: repairStartTime,
            repaired: 0,
            errors: [],
            actions: [],
            duration: 0
        };

        try {
            const validationResults = validationUtils.validate(indexes, logger);

            if (!validationResults.passed) {
                results.actions.push('Attempting to repair validation issues...');
                this._executeRepairs(validationResults, indexes, results, validationUtils, logger);
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

    static _executeRepairs(validationResults, indexes, results, validationUtils, logger) {
        const repairOperations = [
            {
                condition: validationResults.details.termConsistency?.passed === false,
                operation: () => this.repairTermConsistency(indexes, validationUtils),
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
                operation: () => this.repairInvalidReferences(indexes, validationUtils, logger),
                message: (count) => `Repaired ${count} invalid references`
            }
        ];

        repairOperations
            .filter(op => op.condition)
            .forEach(op => {
                const count = op.operation();
                results.repaired += count;
                results.actions.push(op.message(count));
            });
    }

    static repairTermConsistency(indexes, validationUtils) {
        let repairedCount = 0;

        try {
            const termIndex = indexes.term;
            for (const [termId, concepts] of termIndex.entries()) {
                for (const concept of concepts) {
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

                        repairedCount += this._applyOperatorSpecificRepair(concept, indexes);
                    }
                }
            }
        } catch (error) {
            Logger.warn('Failed to repair term consistency:', error);
        }

        return repairedCount;
    }

    static _applyOperatorSpecificRepair(concept, indexes) {
        const operatorHandlers = {
            '-->': () => this._handleInheritanceRepair(concept, indexes),
            '==>': () => this._handleImplicationRepair(concept, indexes),
            '<->': () => this._handleSimilarityRepair(concept, indexes)
        };

        const handler = operatorHandlers[concept.term.operator];
        return handler ? handler() : 0;
    }

    static _handleInheritanceRepair(concept, indexes) {
        if (concept.term.components && concept.term.components.length >= 2) {
            const predicate = concept.term.components[1];
            if (!indexes.inheritance.has(predicate.name)) {
                ValidationUtils.addToIndex(indexes, 'inheritance', predicate.name, concept);
                return 1;
            }
        }
        return 0;
    }

    static _handleImplicationRepair(concept, indexes) {
        if (concept.term.components && concept.term.components.length >= 2) {
            const premise = concept.term.components[0];
            if (!indexes.implication.has(premise.name)) {
                ValidationUtils.addToIndex(indexes, 'implication', premise.name, concept);
                return 1;
            }
        }
        return 0;
    }

    static _handleSimilarityRepair(concept, indexes) {
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

    static removeOrphanedEntries(indexes) {
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
                    for (const concept of Array.from(concepts)) {
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

    static removeDuplicates(indexes) {
        let removedCount = 0;

        try {
            const termIndex = indexes.term;
            const seenConcepts = new Set();

            for (const [termId, concepts] of termIndex.entries()) {
                for (const concept of Array.from(concepts)) {
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

    static repairInvalidReferences(indexes, validationUtils, logger) {
        let repairedCount = 0;

        try {
            const validationResults = validationUtils.validate(indexes, logger);
            if (validationResults.details.invalidReferences &&
                validationResults.details.invalidReferences.errors.length > 0) {
                for (const error of validationResults.details.invalidReferences.errors) {
                    if (logger) logger.warn(`Invalid reference detected: ${error}`);
                }
                repairedCount = validationResults.details.invalidReferences.errors.length;
            }
        } catch (error) {
            if (logger) logger.warn('Failed to repair invalid references:', error);
        }

        return repairedCount;
    }
}
