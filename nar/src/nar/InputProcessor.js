import {BaseComponent} from '@senars/core';
import {Task} from '../task/Task.js';
import {Truth} from '../Truth.js';
import {Term} from '../term/Term.js';
import {PRIORITY} from '../config/constants.js';

export class InputProcessor extends BaseComponent {
    constructor(config = {}, components = {}) {
        super(config, 'InputProcessor');
        this.parser = components.parser;
        this.termFactory = components.termFactory;
        this._inputConfig = config || {};

        if (!this.parser) {
            throw new Error('InputProcessor requires a parser component');
        }
    }

    /**
     * Process input and create a Task
     * @param {string|Task|Object} input - Input to process
     * @param {Object} options - Processing options
     * @returns {Task|{success: boolean, error?: string}} Created task or error result
     */
    processInput(input, options = {}) {
        if (!input) {
            return null;
        }

        try {
            // If already a Task instance, return it
            if (input instanceof Task) {
                return input;
            }

            // Process string input
            if (typeof input === 'string') {
                const normalized = this._normalize(input);
                if (!normalized) {
                    return { success: false, error: 'Empty or invalid input' };
                }

                const validation = this._validate(normalized);
                if (!validation.valid) {
                    return { success: false, error: validation.message };
                }

                return this._processStringInput(normalized, options);
            }

            // Process object input (parsed structure)
            if (input.term || input.sentence) {
                return this._processObjectInput(input, options);
            }

            this.logWarn('Invalid input type:', typeof input);
            return null;
        } catch (error) {
            this.logError('Error processing input:', error);
            throw error;
        }
    }

    /**
     * Normalize string input
     * @private
     */
    _normalize(input) {
        if (typeof input !== 'string') return input;
        const trimmed = input.trim();
        return trimmed || null;
    }

    /**
     * Validate input before processing
     * @private
     */
    _validate(input) {
        const maxLen = this._inputConfig?.maxInputLength ?? 4096;
        if (input.length > maxLen) {
            return { valid: false, message: `Input too long (${input.length} chars)` };
        }
        if (/[\x00-\x08\x0e-\x1f\x7f]/.test(input)) {
            return { valid: false, message: 'Input contains control characters' };
        }
        return { valid: true };
    }

    /**
     * Process string input by parsing and creating task
     * @private
     */
    _processStringInput(input, options) {
        const parsed = this.parser.parse(input);

        if (!parsed) {
            throw new Error('Failed to parse input');
        }

        // If parsed as a raw Term (e.g., natural language), treat as Belief
        if (parsed instanceof Term || (!parsed.term && parsed.name)) {
            return this.createTask({
                term: parsed,
                punctuation: '.',
                truthValue: null,
                taskType: 'BELIEF',
                originalInput: input
            }, options);
        }

        // Normal parsed sentence structure
        if (parsed.term) {
            return this.createTask(parsed, options);
        }

        throw new Error('Invalid parse result structure');
    }

    /**
     * Process already-parsed object input
     * @private
     */
    _processObjectInput(input, options) {
        return this.createTask(input, options);
    }

    /**
     * Create a Task from parsed input
     * @param {Object} parsed - Parsed input structure
     * @param {Object} options - Task creation options
     * @returns {Task} Created task
     */
    createTask(parsed, options = {}) {
        const {term, truthValue, punctuation} = parsed;

        if (!term) {
            throw new Error('Cannot create task without a term');
        }

        const taskType = this._getTaskTypeFromPunctuation(punctuation);
        const truth = this._createTaskTruth(taskType, truthValue, parsed);
        const priority = this._calculateInputPriority(parsed);

        return new Task({
            term,
            punctuation: punctuation || '.',
            truth,
            budget: {priority},
        });
    }

    /**
     * Create truth value for task
     * @private
     */
    _createTaskTruth(taskType, truthValue, parsed) {
        if (taskType === 'QUESTION') {
            if (truthValue) {
                throw new Error(`Questions cannot have truth values: input was ${parsed.originalInput || 'unspecified'}`);
            }
            return null;
        }

        // Use provided truth value or default
        return truthValue
            ? new Truth(truthValue.frequency, truthValue.confidence)
            : new Truth(1.0, 0.9);
    }

    /**
     * Calculate input priority based on truth value and task type
     * @private
     */
    _calculateInputPriority(parsed) {
        const {truthValue, taskType} = parsed;
        const basePriority = this._inputConfig.defaultPriority || PRIORITY.DEFAULT;

        const priorityConfig = this._inputConfig.priority || {};
        const {
            confidenceMultiplier = 0.3,
            goalBoost = 0.2,
            questionBoost = 0.1
        } = priorityConfig;

        const confidenceBoost = truthValue ? (truthValue.confidence ?? 0) * confidenceMultiplier : 0;
        const typeBoost = {
            GOAL: goalBoost,
            QUESTION: questionBoost
        }[taskType] || 0;

        return Math.min(PRIORITY.MAX, basePriority + confidenceBoost + typeBoost);
    }

    /**
     * Get task type from punctuation
     * @private
     */
    _getTaskTypeFromPunctuation(punctuation) {
        const typeMap = {
            '.': 'BELIEF',
            '!': 'GOAL',
            '?': 'QUESTION'
        };
        return typeMap[punctuation] || 'BELIEF';
    }
}
