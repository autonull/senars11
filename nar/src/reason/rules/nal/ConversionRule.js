/**
 * @file ConversionRule.js
 * @description Conversion and Contraposition inference rules.
 *
 * Conversion: (P --> S) |- (S --> P) [with reduced confidence]
 * Contraposition: (S --> P) |- (--P --> --S) [with reduced confidence]
 */

import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';

/**
 * Conversion Rule: Reverse subject and predicate
 * (P --> S) |- (S --> P)
 * Single premise rule with reduced confidence
 */
export class ConversionRule extends NALRule {
    constructor(config = {}) {
        super('nal-conversion', 'nal', 0.7, config);
    }

    canApply(primaryPremise, secondaryPremise) {
        if (!primaryPremise || secondaryPremise) {
            return false;
        } // Unary rule
        const {term} = primaryPremise;
        return term?.isCompound && term.operator === '-->' && term.subject && term.predicate;
    }

    apply(primaryPremise, secondaryPremise, context) {
        if (!this.canApply(primaryPremise, secondaryPremise)) {
            return [];
        }

        const {term} = primaryPremise;
        const termFactory = context?.termFactory;
        if (!termFactory) {
            return [];
        }

        const newTruth = Truth.conversion(primaryPremise.truth);
        if (!newTruth) {
            return [];
        }

        const task = this.createDerivedTask(
            termFactory.create('-->', [term.predicate, term.subject]),
            newTruth, [primaryPremise], context
        );
        return task ? [task] : [];
    }
}

export class ContrapositionRule extends NALRule {
    constructor(config = {}) {
        super('nal-contraposition', 'nal', 0.6, config);
    }

    canApply(primaryPremise, secondaryPremise) {
        if (!primaryPremise || secondaryPremise) {
            return false;
        } // Unary rule
        const {term} = primaryPremise;
        return term?.isCompound && term.operator === '==>' && term.subject && term.predicate;
    }

    apply(primaryPremise, secondaryPremise, context) {
        if (!this.canApply(primaryPremise, secondaryPremise)) {
            return [];
        }

        const {term} = primaryPremise;
        const termFactory = context?.termFactory;
        if (!termFactory) {
            return [];
        }

        const newTruth = Truth.structuralReduction(primaryPremise.truth);
        if (!newTruth) {
            return [];
        }

        const negS = termFactory.create('--', [term.predicate]);
        const negP = termFactory.create('--', [term.subject]);
        const task = this.createDerivedTask(
            termFactory.create('==>', [negS, negP]),
            newTruth, [primaryPremise], context
        );
        return task ? [task] : [];
    }
}
