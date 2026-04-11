/**
 * TextAnalysis.js - Unified text analysis utilities
 * Consolidates entity extraction, intent detection, sentiment analysis, and content similarity.
 */

const ENTITY_PATTERNS = Object.freeze([
    {type: 'person', regex: /@(\w+)/g},
    {type: 'topic', regex: /#(\w+)/g},
    {type: 'concept', regex: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g},
    {type: 'technical', regex: /\b(AI|ML|NLP|API|HTTP|TCP|UDP|JSON|XML)\b/gi}
]);

const INTENT_PATTERNS = Object.freeze([
    {intent: 'question', regex: /[?]|^(what|how|why|explain|tell me)\s/i},
    {intent: 'command', regex: /^[!/]/},
    {intent: 'greeting', regex: /\b(hi|hello|hey|greetings)\b/i}
]);

const SENTIMENT_WORDS = Object.freeze({
    positive: ['good', 'great', 'love', 'like', 'thanks', 'awesome'],
    negative: ['bad', 'hate', 'wrong', 'error', 'terrible']
});

const RESPONSE_PATTERNS = Object.freeze([
    {regex: /\?/, type: 'question'},
    {regex: /\b(hi|hello|hey|greetings)\b/, type: 'greeting'},
    {regex: /\b(thanks|thank you)\b/, type: 'acknowledgment'},
    {regex: /\b(sorry|apologize)\b/, type: 'apology'}
]);

const FACT_PATTERNS = [
    /(\w+) is (?:a|an|the) (\w+)/i,
    /(\w+) lives in (\w+)/i,
    /(\w+) likes (\w+)/i,
    /I (?:live|work|study) in (\w+)/i
];

export function extractEntities(text) {
    if (!text) {
        return [];
    }
    const entities = [];
    for (const {type, regex} of ENTITY_PATTERNS) {
        const matches = text.match(regex);
        if (matches) {
            entities.push(...matches.map(m => ({type, value: m.replace(/[@#]/g, '')})));
        }
    }
    return entities;
}

export function detectIntent(text) {
    if (!text) {
        return [];
    }
    const lower = text.toLowerCase();
    return INTENT_PATTERNS
        .filter(({regex}) => regex.test(lower))
        .map(({intent}) => intent);
}

export function detectSentiment(text) {
    if (!text) {
        return 'neutral';
    }
    const lower = text.toLowerCase();
    if (SENTIMENT_WORDS.positive.some(w => lower.includes(w))) {
        return 'positive';
    }
    if (SENTIMENT_WORDS.negative.some(w => lower.includes(w))) {
        return 'negative';
    }
    return 'neutral';
}

export function extractTopics(text) {
    if (!text) {
        return [];
    }
    return [...(text.match(/#(\w+)/g) ?? [])].map(t => t.slice(1));
}

export function analyzeText(text) {
    return {
        entities: extractEntities(text),
        intents: detectIntent(text),
        sentiment: detectSentiment(text),
        topics: extractTopics(text)
    };
}

export function detectResponseType(text) {
    if (!text) {
        return 'response';
    }
    const lower = text.toLowerCase();
    for (const {regex, type} of RESPONSE_PATTERNS) {
        if (lower.match(regex)) {
            return type;
        }
    }
    return 'response';
}

export function extractFact(text) {
    if (!text) {
        return null;
    }
    for (const pattern of FACT_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            return {type: 'fact', content: match[0], confidence: 0.7};
        }
    }
    return null;
}

export function contentOverlap(a, b, {minWordLength = 3, minOverlap = 2} = {}) {
    if (!a || !b) {
        return false;
    }
    const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > minWordLength));
    const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > minWordLength));
    let overlap = 0;
    for (const word of aWords) {
        if (bWords.has(word)) {
            overlap++;
        }
    }
    return overlap >= minOverlap;
}

export function contentSimilarity(a, b, {minWordLength = 3} = {}) {
    if (!a || !b) {
        return 0;
    }
    const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > minWordLength));
    const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > minWordLength));
    if (aWords.size === 0 || bWords.size === 0) {
        return 0;
    }
    let overlap = 0;
    for (const word of aWords) {
        if (bWords.has(word)) {
            overlap++;
        }
    }
    return overlap / Math.max(aWords.size, bWords.size);
}
