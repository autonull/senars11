import { Logger } from '@senars/core';
import { Punctuation } from '../task/Task.js';
import { cleanText as cleanTextCommon, isValidLength } from '@senars/core/src/util/common.js';

export const cleanText = cleanTextCommon;

export const extractPrimaryTask = (primaryPremise) => primaryPremise ?? null;
export const extractSecondaryTask = (secondaryPremise) => secondaryPremise ?? null;
export const extractTaskFromContext = extractPrimaryTask;

export const isSynchronousRule = (rule) => rule?.type?.toLowerCase()?.includes('nal') ?? false;
export const isAsyncRule = (rule) => rule?.type?.toLowerCase()?.includes('lm') ?? false;

export const parseListFromResponse = (lmResponse, { removeEmpty = true } = {}) => {
    if (!lmResponse) return [];

    const lines = lmResponse
        .split('\n')
        .map(line => line.trim().replace(/^\s*\d+[\.)]|\s*|^[-*]\s*/, '').trim())
        .filter(line => line.length > 0);

    return removeEmpty ? lines.filter(item => item.length > 0) : lines;
};

export const parseSubGoals = (lmResponse) => parseListFromResponse(lmResponse, { removeEmpty: false });

const INVALID_PATTERNS = ['sorry', 'cannot', 'unable'];
const INVALID_TEXT_PATTERNS = [...INVALID_PATTERNS, 'no information'];

const hasInvalidPattern = (text, patterns) =>
    patterns.some(pattern => text.toLowerCase().includes(pattern));

export const isValidSubGoal = (goal, minLength, maxLength) =>
    isValidLength(goal, minLength, maxLength) && !hasInvalidPattern(goal, INVALID_PATTERNS);

export const isValidText = (text, minLength = 1, maxLength = 1000) =>
    isValidLength(text, minLength, maxLength) && !hasInvalidPattern(text, INVALID_TEXT_PATTERNS);

export const processDerivation = (result, maxDerivationDepth, budgetManager = null) => {
    if (!result?.stamp) return result;

    try {
        const depth = result.stamp.depth ?? 0;
        const withinBudget = budgetManager?.checkDerivationDepth
            ? budgetManager.checkDerivationDepth(depth, maxDerivationDepth)
            : depth <= maxDerivationDepth;

        if (!withinBudget) return null;

        if (budgetManager?.calculateComplexityPenalty && result.term?.complexity && result.budget) {
            const penalty = budgetManager.calculateComplexityPenalty(result.term.complexity);
            const newBudget = {
                ...result.budget,
                priority: result.budget.priority / penalty,
                durability: result.budget.durability / penalty
            };
            return result.clone?.({ budget: newBudget }) ?? Object.assign(result, { budget: newBudget });
        }

        return result;
    } catch (error) {
        Logger.debug('Error processing derivation:', error.message);
        return null;
    }
};

export const createDerivedTask = (originalTask, newProps) => ({
    ...originalTask,
    ...newProps,
    derivedFrom: originalTask.id ?? originalTask.term?.toString?.() ?? 'unknown'
});

export const deriveTruthValue = (originalTruth, confidenceMultiplier = 0.9) => ({
    frequency: originalTruth?.frequency ?? 0.5,
    confidence: (originalTruth?.confidence ?? 0.9) * confidenceMultiplier
});

export const hasPattern = (term, patterns) => {
    const termStr = term?.toString?.() ?? String(term ?? '');
    return patterns.some(pattern => termStr.toLowerCase().includes(pattern.toLowerCase()));
};

export const createContext = (primaryPremise, secondaryPremise, systemContext = {}) => ({
    primary: primaryPremise,
    secondary: secondaryPremise,
    ...systemContext,
    timestamp: Date.now(),
    metadata: {
        source: 'lm-rule',
        processingStage: 'apply',
        ...systemContext.metadata
    }
});

export const isGoal = (task) => task?.punctuation === Punctuation.GOAL;
export const isQuestion = (task) => task?.punctuation === Punctuation.QUESTION;
export const isBelief = (task) => task?.punctuation === Punctuation.BELIEF;

export const tryParseNarsese = (text, parser) => {
    if (!text || !parser) return null;

    const match = text.match(/([<(])[^>)]+([>)])/);
    const toParse = match ? match[0] : text;

    try {
        return parser.parse(toParse);
    } catch (error) {
        Logger.debug('Failed to parse Narsese text', { text: toParse, error: error.message });
        return null;
    }
};

export const createFallbackTerm = (text, termFactory) => {
    if (!text) return null;

    const cleanContent = text.replace(/"/g, '').trim();
    if (!cleanContent) return null;

    const termStr = `"${cleanContent}"`;

    try {
        return termFactory?.atomic?.(termStr) ?? termStr;
    } catch (error) {
        Logger.debug('Failed to create atomic term', { termStr, error: error.message });
        return termStr;
    }
};

export const KeywordPatterns = Object.freeze({
    problemSolving: [
        'solve', 'fix', 'repair', 'improve', 'handle', 'address', 'resolve', 'overcome', 'manage', 'operate',
        'apply', 'adapt', 'implement', 'execute', 'create', 'build', 'design', 'plan', 'organize', 'find a way to'
    ],
    conflict: ['contradict', 'conflict', 'inconsistent', 'opposite', 'versus', 'vs'],
    complexRelation: (termStr) => termStr.includes('-->') || termStr.includes('<->') || termStr.includes('==>'),
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
});
