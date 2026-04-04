import {Logger} from '@senars/core';

export class TruthValueUtils {
    static normalizeMetric(value, min, max) {
        if (value < min) return 0;
        if (value > max) return 1;
        if (max === min) return 0.5;
        return (value - min) / (max - min);
    }

    static calculateFrequencyFromMetric(value, min, max) {
        return this.normalizeMetric(value, min, max);
    }

    static calculateConfidenceFromMetric(value, min, max) {
        return this.normalizeMetric(value, min, max);
    }

    static calculateTruthValue(value, min, max, defaultValue = 0.5) {
        const normalized = this.normalizeMetric(value, min, max);
        return isNaN(normalized) ? defaultValue : normalized;
    }

    static createTruthValue(frequency, confidence = 0.9) {
        return `%${frequency.toFixed(2)};${confidence.toFixed(2)}%`;
    }

    static calculateWeightedTruthValue(metrics) {
        let weightedSum = 0, totalWeight = 0;
        for (const {value, weight, min, max} of metrics) {
            const normalizedValue = this.normalizeMetric(value, min, max);
            weightedSum += normalizedValue * weight;
            totalWeight += weight;
        }
        return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
    }
}

const DEFAULT_TEMPLATES = Object.freeze({
    statement: ({subject, predicate, truth}) =>
        `<${subject} --> ${predicate}>${_formatTruthValue(truth)}`,

    relationship: ({subject, relation, object, truth}) =>
        `<${subject} ${relation} ${object}>${_formatTruthValue(truth)}`,

    inheritance: ({subject, object, truth}) =>
        `<${subject} --> ${object}>${_formatTruthValue(truth)}`,

    similarity: ({subject, object, truth}) =>
        `<${subject} <-> ${object}>${_formatTruthValue(truth)}`,

    implication: ({subject, object, truth}) =>
        `<${subject} =/> ${object}>${_formatTruthValue(truth)}`,

    'file-analysis': ({filePath, metric, value, min = 0, max = 100}, options = {}) => {
        const normalizedValue = TruthValueUtils.normalizeMetric(value, min, max);
        const truth = {frequency: normalizedValue, confidence: options.confidence ?? 0.9};
        return `<("${filePath}" --> ${metric}) --> ${value}>${_formatTruthValue(truth)}`;
    },

    'directory-analysis': ({dirPath, metric, value, min = 0, max = 100}, options = {}) => {
        const normalizedValue = TruthValueUtils.normalizeMetric(value, min, max);
        const truth = {frequency: normalizedValue, confidence: options.confidence ?? 0.8};
        return `<("${dirPath}" --> ${metric}) --> ${value}>${_formatTruthValue(truth)}`;
    },

    'test-result': ({testName, status, duration, truth}) => {
        if (status) {
            return `<("${testName}" --> pass) --> ${status}>${_formatTruthValue(truth)}`;
        } else if (duration !== undefined) {
            return `<("${testName}" --> time) --> ${duration}ms>${_formatTruthValue(truth)}`;
        }
        return null;
    },

    containment: ({container, contained, relationship = 'in', truth}) =>
        `<("${contained}" --> ${relationship}_of) --> "${container}">${_formatTruthValue(truth)}`
});

function _formatTruthValue(truth) {
    if (!truth) return '. %1.00;0.90%';

    if (typeof truth === 'number') {
        return `. ${TruthValueUtils.createTruthValue(truth, 0.9)}`;
    }

    if (typeof truth === 'object') {
        const frequency = truth.frequency !== undefined ? truth.frequency : (truth.f ?? 1.0);
        const confidence = truth.confidence !== undefined ? truth.confidence : (truth.c ?? 0.9);
        return `. ${TruthValueUtils.createTruthValue(frequency, confidence)}`;
    }

    return '. %1.00;0.90%';
}

export class NarseseTemplate {
    constructor() {
        this.templates = new Map(Object.entries(DEFAULT_TEMPLATES));
    }

    registerTemplate(name, templateFn) {
        this.templates.set(name, templateFn);
    }

    executeTemplate(name, data, options = {}) {
        const templateFn = this.templates.get(name);
        if (!templateFn) {
            throw new Error(`Template "${name}" not found`);
        }

        return templateFn(data, options);
    }

    createTemplate(name, templateFn) {
        this.registerTemplate(name, templateFn);
        return this;
    }

    executeBatch(operations) {
        return operations.map(op => {
            if (typeof op === 'string') {
                return op;
            }
            if (typeof op === 'object' && op.template && op.data) {
                return this.executeTemplate(op.template, op.data, op.options || {});
            }
            return null;
        }).filter(Boolean);
    }
}

export const defaultNarseseTemplate = new NarseseTemplate();

export class TemplateBasedKnowledge {
    constructor(data = null, options = {}) {
        this.data = data;
        this.options = options;
        this.templateAPI = defaultNarseseTemplate;
    }

    async createTasksWithTemplate(templateName, data, options = {}) {
        try {
            return this.templateAPI.executeTemplate(templateName, data, options);
        } catch (error) {
            Logger.error(`Template error: ${error.message}`);
            return null;
        }
    }

    async createBatchTasksWithTemplate(operations) {
        return this.templateAPI.executeBatch(operations);
    }

    registerCustomTemplate(name, templateFn) {
        this.templateAPI.registerTemplate(name, templateFn);
    }
}