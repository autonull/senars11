/**
 * Concept and memory constants for NARS
 * Following AGENTS.md guidelines for named constants over magic numbers
 */

/**
 * Concept capacity distribution
 */
export const CONCEPT_CAPACITY = Object.freeze({
    /** Belief bag capacity percentage */
    BELIEF_CAPACITY: 0.6,
    /** Goal bag capacity percentage */
    GOAL_CAPACITY: 0.3,
    /** Question bag capacity percentage */
    QUESTION_CAPACITY: 0.1
});

/**
 * Concept activation thresholds
 */
export const CONCEPT_ACTIVATION = Object.freeze({
    /** Minimum activation for concept to be considered active */
    MIN_ACTIVE: 0.1,
    /** High activation threshold */
    HIGH_ACTIVATION: 0.7,
    /** Low activation threshold */
    LOW_ACTIVATION: 0.2,
    /** Default activation for new concepts */
    DEFAULT_ACTIVATION: 0.5
});

/**
 * Concept decay and forgetting parameters
 */
export const CONCEPT_DECAY = Object.freeze({
    /** Activation decay rate per cycle */
    ACTIVATION_DECAY: 0.95,
    /** Minimum priority to keep concept */
    MIN_PRIORITY_TO_KEEP: 0.05,
    /** Propagation strength to related concepts */
    PROPAGATION_STRENGTH: 0.1,
    /** Maximum concept age in milliseconds */
    MAX_CONCEPT_AGE: 1000000
});

/**
 * Memory consolidation parameters
 */
export const MEMORY_CONSOLIDATION = Object.freeze({
    /** Activation threshold for consolidation */
    ACTIVATION_THRESHOLD: 0.1,
    /** Decay rate for unused concepts */
    DECAY_RATE: 0.05,
    /** Propagation factor for related concepts */
    PROPAGATION_FACTOR: 0.3,
    /** Forgetting threshold */
    FORGETTING_THRESHOLD: 0.1,
    /** Forgetting rate */
    FORGETTING_RATE: 0.05,
    /** Minimum tasks required before decay applies */
    MIN_TASKS_FOR_DECAY: 2,
    /** Consolidation interval in milliseconds */
    CONSOLIDATION_INTERVAL: 100
});

/**
 * Recency decay factors for task aging
 */
export const RECENCY_DECAY = Object.freeze({
    /** Short-term memory threshold (ms) */
    SHORT_THRESHOLD: 60000,
    /** Medium-term memory threshold (ms) */
    MEDIUM_THRESHOLD: 300000,
    /** Short-term decay factor */
    SHORT_FACTOR: 0.2,
    /** Medium-term decay factor */
    MEDIUM_FACTOR: 0.5,
    /** Long-term decay factor */
    LONG_FACTOR: 1.0
});
