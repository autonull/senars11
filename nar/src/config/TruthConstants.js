/**
 * Truth value constants for NARS
 * Following AGENTS.md guidelines for named constants over magic numbers
 */

/**
 * Default truth values
 */
export const TRUTH_DEFAULTS = Object.freeze({
    /** Neutral frequency value (uncertain) */
    NEUTRAL_FREQUENCY: 0.5,
    /** Default confidence value */
    DEFAULT_CONFIDENCE: 0.9,
    /** Default quality value */
    DEFAULT_QUALITY: 0.5
});

/**
 * Truth value thresholds and limits
 */
export const TRUTH_THRESHOLDS = Object.freeze({
    /** Epsilon for floating-point comparisons */
    EPSILON: 0.001,
    /** Minimum meaningful confidence */
    MIN_CONFIDENCE: 0.01,
    /** Maximum confidence (just below 1.0 to avoid edge cases) */
    MAX_CONFIDENCE: 0.999,
    /** High confidence threshold for strong beliefs */
    HIGH_CONFIDENCE: 0.9,
    /** Low confidence threshold for weak beliefs */
    LOW_CONFIDENCE: 0.3
});

/**
 * Truth value weights and factors
 */
export const TRUTH_WEIGHTS = Object.freeze({
    /** Weight for frequency in truth comparison */
    FREQUENCY_WEIGHT: 0.5,
    /** Weight for confidence in truth comparison */
    CONFIDENCE_WEIGHT: 0.5,
    /** Weakening factor for confidence calculation */
    WEAKENING_FACTOR: 1.0
});

/**
 * Precision settings for truth value display
 */
export const TRUTH_PRECISION = Object.freeze({
    /** Decimal places for truth value display */
    DECIMAL_PLACES: 2
});
