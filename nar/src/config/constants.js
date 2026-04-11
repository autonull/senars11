/**
 * Constants for SeNARS configuration
 */

export const TRUTH = Object.freeze({
    DEFAULT_FREQUENCY: 1.0,
    DEFAULT_CONFIDENCE: 0.9,
    MIN_FREQUENCY: 0.0,
    MAX_FREQUENCY: 1.0,
    MIN_CONFIDENCE: 0.0,
    MAX_CONFIDENCE: 1.0,
    EPSILON: 0.001,
    PRECISION: 2,  // Keep as 2 to match test expectations
    WEAKENING_FACTOR: 0.1,
    MIN_PRIORITY: 0.0,
    MAX_PRIORITY: 1.0
});

export const PRIORITY = Object.freeze({
    DEFAULT: 0.5,
    MIN: 0.0,
    MAX: 1.0,
    THRESHOLD: 0.1
});

export const CYCLE = Object.freeze({
    DEFAULT_LENGTH: 100,
    MAX_LENGTH: 1000,
    MIN_LENGTH: 1,
    DEFAULT_DELAY: 10
});

export const MEMORY = Object.freeze({
    MAX_CONCEPTS: 10000,
    DEFAULT_CAPACITY: 1000,
    MIN_CAPACITY: 10,
    MAX_CAPACITY: 100000,
    FOCUS_SET_SIZE: 100,
    FORGETTING_THRESHOLD: 0.1,
    CONSOLIDATION_INTERVAL: 1000,
    ACTIVATION_DECAY: 0.01
});

export const PERFORMANCE = Object.freeze({
    DEFAULT_TIMEOUT: 5000,
    MAX_TIMEOUT: 30000,
    MIN_TIMEOUT: 100,
    TIMEOUT_MS: 5000,
    CACHE_SIZE: 1000,
    BATCH_SIZE: 10
});

export const STAMP = Object.freeze({
    BLOOM_SIZE: 256,
    BLOOM_HASHES: 5
});

export const SYSTEM = Object.freeze({
    VERSION: '10.0.0',
    NAME: 'SeNARS',
    DEFAULT_PORT: 8080,
    DEFAULT_HOST: '0.0.0.0',
    MAX_ERROR_RATE: 0.1,
    RECOVERY_ATTEMPTS: 3,
    GRACEFUL_DEGRADATION_THRESHOLD: 0.2
});

export const WEBSOCKET_CONFIG = Object.freeze({
    defaultPort: 8080,
    defaultHost: '0.0.0.0',
    defaultPath: '/ws',
    maxConnections: 50,
    minBroadcastInterval: 10,
    messageBufferSize: 10000,
    rateLimitWindowMs: 1000,
    maxMessagesPerWindow: 1000,
    maxPayload: 1024 * 1024, // 1MB
});

export const NAR_EVENTS = Object.freeze([
    'task.input',
    'task.processed',
    'cycle.start',
    'cycle.complete',
    'task.added',
    'belief.added',
    'question.answered',
    'system.started',
    'system.stopped',
    'system.reset',
    'system.loaded',
    'reasoning.step',
    'concept.created',
    'task.completed'
]);

export const DEFAULT_CLIENT_CAPABILITIES = Object.freeze([
    'narseseInput',
    'testLMConnection',
    'subscribe',
    'unsubscribe'
]);

export const SUPPORTED_MESSAGE_TYPES = Object.freeze([
    'narseseInput',
    'testLMConnection',
    'subscribe',
    'unsubscribe',
    'ping',
    'log',
    'requestCapabilities'
]);

export const DEMO_COMMANDS = Object.freeze({
    help: ['help', 'h', '?'],
    quit: ['quit', 'q', 'exit'],
    status: ['status', 's', 'stats'],
    memory: ['memory', 'm'],
    trace: ['trace', 't'],
    reset: ['reset', 'r'],
    save: ['save', 'sv'],
    load: ['load', 'ld'],
    demo: ['demo', 'd', 'example'],
    next: ['next', 'n'],
    run: ['run', 'go'],
    stop: ['stop', 'st']
});

// Add operator constants (non-temporal subset)
export const OP = Object.freeze({
    // Atomic types
    ATOM: {str: '.', arity: [0, 0]},
    INT: {str: '+', arity: [0, 0]},
    BOOL: {str: 'B', arity: [0, 0]},
    IMG: {str: '/', arity: [0, 0]},

    // Variables
    VAR_INDEP: {str: '$', ch: '$'},
    VAR_DEP: {str: '#', ch: '#'},
    VAR_QUERY: {str: '?', ch: '?'},
    VAR_PATTERN: {str: '%', ch: '%'},

    // Statements (binary, non-temporal)
    INH: {str: '-->', arity: [2, 2], statement: true},
    SIM: {str: '<->', arity: [2, 2], statement: true, commutative: true},
    EQ: {str: '=', arity: [2, 2], commutative: true},
    DIFF: {str: '<~>', arity: [2, 2], commutative: true},

    // Compounds
    NEG: {str: '--', arity: [1, 1]},
    PROD: {str: '*', arity: [0, Infinity]},
    SETi: {str: '[', ch: '[', arity: [1, Infinity], commutative: true},
    SETe: {str: '{', ch: '{', arity: [1, Infinity], commutative: true},
    DELTA: {str: 'Δ', ch: 'Δ', arity: [1, 1]},

    // Deferred temporal operators (defined but not fully implemented)
    CONJ: {str: '&&', arity: [2, Infinity], commutative: true, temporal: true},
    IMPL: {str: '==>', arity: [2, 2], statement: true, temporal: true},
});

// Punctuation
export const PUNCTUATION = Object.freeze({
    BELIEF: '.',
    QUESTION: '?',
    GOAL: '!',
    QUEST: '@',
    COMMAND: ';',
});

// Syntax characters
export const SYNTAX = Object.freeze({
    ARGUMENT_SEPARATOR: ',',
    SETi_CLOSE: ']',
    SETe_CLOSE: '}',
    COMPOUND_OPEN: '(',
    COMPOUND_CLOSE: ')',
});