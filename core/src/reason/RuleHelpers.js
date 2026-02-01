/**
 * @file src/reason/RuleHelpers.js
 * @description Shared helper functions for reasoning rules, enhanced for stream-based architecture.
 */

import {Logger} from '../util/Logger.js';
import {Punctuation} from '../task/Task.js';

export function extractPrimaryTask(primaryPremise, secondaryPremise, context) {
    return primaryPremise ?? null;
}

export function extractSecondaryTask(primaryPremise, secondaryPremise, context) {
    return secondaryPremise ?? null;
}

export function extractTaskFromContext(primaryPremise, secondaryPremise, context) {
    return extractPrimaryTask(primaryPremise, secondaryPremise, context);
}

export function isSynchronousRule(rule) {
    return (rule.type ?? '').toLowerCase().includes('nal');
}

export function isAsyncRule(rule) {
    return (rule.type ?? '').toLowerCase().includes('lm');
}

export function parseListFromResponse(lmResponse, options = {}) {
    const {removeEmpty = true} = options;
    if (!lmResponse) return [];

    const lines = lmResponse
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.replace(/^\s*\d+[\.)]|\s*|^[-*]\s*/, '').trim());

    return removeEmpty ? lines.filter(item => item.length > 0) : lines;
}

// Alias for backward compatibility - use parseListFromResponse instead
export const parseSubGoals = (lmResponse) => parseListFromResponse(lmResponse, {removeEmpty: false});

const INVALID_PATTERNS = ['sorry', 'cannot', 'unable'];
const INVALID_TEXT_PATTERNS = [...INVALID_PATTERNS, 'no information'];

const isValidLength = (text, min, max) =>
    text && text.length >= min && text.length <= max;

const hasInvalidPattern = (text, patterns) =>
    patterns.some(pattern => text.toLowerCase().includes(pattern));

export const isValidSubGoal = (goal, minLength, maxLength) =>
    isValidLength(goal, minLength, maxLength) && !hasInvalidPattern(goal, INVALID_PATTERNS);

export function cleanText(text) {
    if (!text) return '';
    return text.replace(/^["']|["']$/g, '').replace(/[.,;!?]+$/, '').trim();
}

export const isValidText = (text, minLength = 1, maxLength = 1000) =>
    isValidLength(text, minLength, maxLength) && !hasInvalidPattern(text, INVALID_TEXT_PATTERNS);

export function processDerivation(result, maxDerivationDepth, budgetManager = null) {
    if (!result?.stamp) return result;

    try {
        const derivationDepth = result.stamp.depth ?? 0;

        // Use BudgetManager if available for depth check
        if (budgetManager && typeof budgetManager.checkDerivationDepth === 'function') {
            if (!budgetManager.checkDerivationDepth(derivationDepth, maxDerivationDepth)) {
                Logger.debug(`Discarding derivation - BudgetManager rejected depth (${derivationDepth} > ${maxDerivationDepth})`);
                return null;
            }
        } else if (derivationDepth > maxDerivationDepth) {
            Logger.debug(`Discarding derivation - exceeds max depth (${derivationDepth} > ${maxDerivationDepth})`);
            return null;
        }

        // Apply complexity penalty if BudgetManager is available
        if (budgetManager && typeof budgetManager.calculateComplexityPenalty === 'function' && result.term?.complexity) {
             const penalty = budgetManager.calculateComplexityPenalty(result.term.complexity);
             // Apply penalty to task budget (priority/durability)
             if (result.budget) {
                 const newBudget = {
                     ...result.budget,
                     priority: result.budget.priority / penalty,
                     durability: result.budget.durability / penalty
                 };

                 // Use clone if available, otherwise try assignment (though Task is usually frozen)
                 if (typeof result.clone === 'function') {
                     result = result.clone({budget: newBudget});
                 } else {
                     result.budget = newBudget;
                 }
             }
        }

        return result;
    } catch (error) {
        Logger.debug('Error processing derivation:', error.message);
        return null;
    }
}

export function createDerivedTask(originalTask, newProps) {
    return {
        ...originalTask,
        ...newProps,
        derivedFrom: originalTask.id ?? originalTask.term?.toString?.() ?? 'unknown'
    };
}

export function deriveTruthValue(originalTruth, confidenceMultiplier = 0.9) {
    if (!originalTruth) {
        return {frequency: 0.5, confidence: 0.9};
    }

    return {
        frequency: originalTruth.frequency ?? 0.5,
        confidence: (originalTruth.confidence ?? 0.9) * confidenceMultiplier
    };
}

export function hasPattern(term, patterns) {
    const termStr = term?.toString?.() ?? String(term ?? '');
    const lowerTerm = termStr.toLowerCase();

    return patterns.some(pattern => lowerTerm.includes(pattern.toLowerCase()));
}

export function createContext(primaryPremise, secondaryPremise, systemContext = {}) {
    return {
        primary: primaryPremise,
        secondary: secondaryPremise,
        ...systemContext,
        timestamp: Date.now(),
        metadata: {
            source: 'lm-rule',
            processingStage: 'apply',
            ...systemContext.metadata
        }
    };
}

export function isGoal(task) {
    return task?.punctuation === Punctuation.GOAL;
}

export function isQuestion(task) {
    return task?.punctuation === Punctuation.QUESTION;
}

export function isBelief(task) {
    return task?.punctuation === Punctuation.BELIEF;
}

export function tryParseNarsese(text, parser) {
    if (!text || !parser) return null;

    const match = text.match(/([<(])[^>)]+([>)])/);
    const toParse = match ? match[0] : text;

    try {
        return parser.parse(toParse);
    } catch (error) {
        Logger.debug('Failed to parse Narsese text', {text: toParse, error: error.message});
        return null;
    }
}

export function createFallbackTerm(text, termFactory) {
    if (!text) return null;

    const cleanContent = text.replace(/"/g, '').trim();
    if (!cleanContent) return null;

    const termStr = `"${cleanContent}"`;

    try {
        if (termFactory?.atomic) {
            return termFactory.atomic(termStr);
        }
        return termStr;
    } catch (error) {
        Logger.debug('Failed to create atomic term', {termStr, error: error.message});
        return termStr;
    }
}

export const KeywordPatterns = {
    problemSolving: [
        'solve', 'fix', 'repair', 'improve', 'handle', 'address', 'resolve', 'overcome', 'manage', 'operate',
        'apply', 'adapt', 'implement', 'execute', 'create', 'build', 'design', 'plan', 'organize', 'find a way to'
    ],

    conflict: ['contradict', 'conflict', 'inconsistent', 'opposite', 'versus', 'vs'],

    complexRelation: (termStr) => {
        return termStr.includes('-->') || termStr.includes('<->') || termStr.includes('==>');
    },

    narrative: [
        'when', 'then', 'if', 'first', 'after', 'before', 'sequence', 'procedure', 'instruction', 'process', 'step', 'guide', 'how to'
    ],

    temporalCausal: [
        'before', 'after', 'when', 'then', 'while', 'during', 'causes', 'leads to', 'results in',
        'because', 'since', 'due to', 'therefore', 'consequently', 'if', 'precedes', 'follows'
    ],

    uncertainty: [
        'maybe', 'perhaps', 'likely', 'unlikely', 'uncertain', 'probably', 'possibly', 'might',
        'tend to', 'often', 'sometimes', 'generally', 'usually', 'could be', 'seems'
    ],

    ambiguous: [
        'it', 'this', 'that', 'they', 'them', 'which', 'what', 'how', 'some', 'few', 'many', 'most', 'thing', 'stuff', 'deal with'
    ],

    complexity: [
        'solve', 'achieve', 'optimize', 'balance', 'maximize', 'minimize', 'understand', 'analyze',
        'investigate', 'discover', 'resolve', 'plan', 'design', 'create', 'develop', 'implement'
    ]
};