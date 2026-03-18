/**
 * Task budget constants for NARS
 * Following AGENTS.md guidelines for named constants over magic numbers
 */

/**
 * Default budget values
 */
export const BUDGET_DEFAULTS = Object.freeze({
    /** Default priority for new tasks */
    DEFAULT_PRIORITY: 0.5,
    /** Default durability for new tasks */
    DEFAULT_DURABILITY: 0.5,
    /** Default quality for new tasks */
    DEFAULT_QUALITY: 0.5
});

/**
 * Budget thresholds and limits
 */
export const BUDGET_THRESHOLDS = Object.freeze({
    /** Minimum priority for task processing */
    MIN_PRIORITY: 0.01,
    /** Maximum priority */
    MAX_PRIORITY: 1.0,
    /** High priority threshold */
    HIGH_PRIORITY: 0.8,
    /** Low priority threshold */
    LOW_PRIORITY: 0.2,
    /** Minimum durability to keep task */
    MIN_DURABILITY: 0.01
});

/**
 * Budget decay and adjustment factors
 */
export const BUDGET_FACTORS = Object.freeze({
    /** Priority decay rate per cycle */
    PRIORITY_DECAY: 0.95,
    /** Durability decay rate per cycle */
    DURABILITY_DECAY: 0.9,
    /** Quality adjustment factor */
    QUALITY_FACTOR: 0.1,
    /** Priority boost for successful derivations */
    SUCCESS_BOOST: 1.2,
    /** Priority penalty for failed derivations */
    FAILURE_PENALTY: 0.8
});

/**
 * Task capacity limits
 */
export const TASK_LIMITS = Object.freeze({
    /** Maximum tasks per concept bag */
    MAX_TASKS_PER_CONCEPT: 100,
    /** Maximum goals per concept bag */
    MAX_GOALS_PER_CONCEPT: 50,
    /** Maximum questions per concept bag */
    MAX_QUESTIONS_PER_CONCEPT: 25
});
