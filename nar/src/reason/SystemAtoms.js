/**
 * SystemAtoms for the new reason system
 * Defines core system-level atomic terms and concepts
 */

// Define core system atoms that may be referenced across the system
export const SYSTEM_ATOMS = {
    // Self-referential atoms
    SELF: Symbol.for('SYSTEM_SELF'),
    MEMORY: Symbol.for('SYSTEM_MEMORY'),
    REASONER: Symbol.for('SYSTEM_REASONER'),
    TASK_MANAGER: Symbol.for('SYSTEM_TASK_MANAGER'),

    // Performance-related atoms
    PERFORMANCE: Symbol.for('SYSTEM_PERFORMANCE'),
    THROUGHPUT: Symbol.for('SYSTEM_THROUGHPUT'),
    LATENCY: Symbol.for('SYSTEM_LATENCY'),
    EFFICIENCY: Symbol.for('SYSTEM_EFFICIENCY'),

    // Meta-cognitive atoms
    METACOGNITION: Symbol.for('SYSTEM_METACOGNITION'),
    SELF_MODEL: Symbol.for('SYSTEM_SELF_MODEL'),
    REASONING_STATE: Symbol.for('SYSTEM_REASONING_STATE'),

    // Resource management atoms
    RESOURCES: Symbol.for('SYSTEM_RESOURCES'),
    MEMORY_USAGE: Symbol.for('SYSTEM_MEMORY_USAGE'),
    CPU_USAGE: Symbol.for('SYSTEM_CPU_USAGE'),
    BANDWIDTH: Symbol.for('SYSTEM_BANDWIDTH'),

    // Quality and truth atoms
    TRUTH: Symbol.for('SYSTEM_TRUTH'),
    CONFIDENCE: Symbol.for('SYSTEM_CONFIDENCE'),
    FREQUENCY: Symbol.for('SYSTEM_FREQUENCY'),
    QUALITY: Symbol.for('SYSTEM_QUALITY'),

    // Process control atoms
    START: Symbol.for('SYSTEM_START'),
    STOP: Symbol.for('SYSTEM_STOP'),
    PAUSE: Symbol.for('SYSTEM_PAUSE'),
    RESUME: Symbol.for('SYSTEM_RESUME'),

    // Feedback and learning atoms
    FEEDBACK: Symbol.for('SYSTEM_FEEDBACK'),
    LEARNING: Symbol.for('SYSTEM_LEARNING'),
    ADAPTATION: Symbol.for('SYSTEM_ADAPTATION'),
    IMPROVEMENT: Symbol.for('SYSTEM_IMPROVEMENT'),

    // Error and exception atoms
    ERROR: Symbol.for('SYSTEM_ERROR'),
    WARNING: Symbol.for('SYSTEM_WARNING'),
    EXCEPTION: Symbol.for('SYSTEM_EXCEPTION'),
    RECOVERY: Symbol.for('SYSTEM_RECOVERY'),

    // Temporal atoms
    NOW: Symbol.for('SYSTEM_NOW'),
    PAST: Symbol.for('SYSTEM_PAST'),
    FUTURE: Symbol.for('SYSTEM_FUTURE'),
    DURATION: Symbol.for('SYSTEM_DURATION'),

    // Logical operators and connectors
    AND: Symbol.for('LOGICAL_AND'),
    OR: Symbol.for('LOGICAL_OR'),
    NOT: Symbol.for('LOGICAL_NOT'),
    IMPLIES: Symbol.for('LOGICAL_IMPLIES'),

    // Quantification atoms
    FOR_ALL: Symbol.for('QUANTIFIER_FOR_ALL'),
    EXISTS: Symbol.for('QUANTIFIER_EXISTS'),
    SOME: Symbol.for('QUANTIFIER_SOME'),

    // Causal relationship atoms
    CAUSE: Symbol.for('CAUSAL_CAUSE'),
    EFFECT: Symbol.for('CAUSAL_EFFECT'),
    CORRELATION: Symbol.for('CAUSAL_CORRELATION'),
    DEPENDENCY: Symbol.for('CAUSAL_DEPENDENCY'),

    // Goal and intention atoms
    GOAL: Symbol.for('INTENTIONAL_GOAL'),
    INTENTION: Symbol.for('INTENTIONAL_INTENTION'),
    DESIRE: Symbol.for('INTENTIONAL_DESIRE'),
    INTEND: Symbol.for('INTENTIONAL_INTEND'),

    // Question and inquiry atoms
    QUESTION: Symbol.for('INQUIRY_QUESTION'),
    ANSWER: Symbol.for('INQUIRY_ANSWER'),
    INQUIRY: Symbol.for('INQUIRY_INQUIRY'),
    SEEK: Symbol.for('INQUIRY_SEEK'),

    // Knowledge and belief atoms
    BELIEF: Symbol.for('EPISTEMIC_BELIEF'),
    KNOWLEDGE: Symbol.for('EPISTEMIC_KNOWLEDGE'),
    EVIDENCE: Symbol.for('EPISTEMIC_EVIDENCE'),
    JUSTIFICATION: Symbol.for('EPISTEMIC_JUSTIFICATION'),

    // Action and operation atoms
    ACTION: Symbol.for('ACTION_ACTION'),
    OPERATION: Symbol.for('ACTION_OPERATION'),
    EXECUTE: Symbol.for('ACTION_EXECUTE'),
    PERFORM: Symbol.for('ACTION_PERFORM')
};

// Export convenience functions to create system atom terms
export function createSystemAtom(name) {
    return {
        id: `system_atom_${name}`,
        name: name,
        type: 'SYSTEM_ATOM',
        symbol: SYSTEM_ATOMS[name.toUpperCase()] || Symbol.for(`SYSTEM_${name}`),
        toString() {
            return `<${name}>`;
        },
        equals(other) {
            return other &&
                other.type === 'SYSTEM_ATOM' &&
                other.name === name;
        }
    };
}

// Export commonly used system atom instances
export const SELF_ATOM = createSystemAtom('SELF');
export const PERFORMANCE_ATOM = createSystemAtom('PERFORMANCE');
export const METACOGNITION_ATOM = createSystemAtom('METACOGNITION');
export const REASONER_ATOM = createSystemAtom('REASONER');
export const MEMORY_ATOM = createSystemAtom('MEMORY');

export default SYSTEM_ATOMS;