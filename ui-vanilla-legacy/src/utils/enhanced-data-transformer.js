/**
 * EnhancedDataTransformer - Advanced data transformation with schema validation
 */
import { schemaValidator } from './schema-validator.js';
import errorHandler from './error-handler.js';

class EnhancedDataTransformer {
    /**
     * Transform data based on type with schema validation
     */
    static transform(data, options = {}) {
        const { type, validate = true, schema = null } = options;

        if (validate) {
            if (schema) {
                // Validate against provided schema
                const validation = schemaValidator.validateInline(data, schema);
                if (!validation.valid) {
                    errorHandler.handleError(
                        new Error(`Data transformation failed validation: ${validation.errors.join(', ')}`),
                        { data, schema, errors: validation.errors }
                    );
                    return null;
                }
            } else if (type) {
                // Validate against registered schema
                const validation = schemaValidator.validate(data, type);
                if (!validation.valid) {
                    errorHandler.handleError(
                        new Error(`Data transformation failed validation: ${validation.errors.join(', ')}`),
                        { data, type, errors: validation.errors }
                    );
                    return null;
                }
            }
        }

        // Apply the appropriate transformation
        switch (type) {
            case 'narseseInput':
                return this._transformNarseseInput(data);
            case 'concept':
                return this._transformConcept(data);
            case 'task':
                return this._transformTask(data);
            case 'belief':
                return this._transformBelief(data);
            case 'question':
                return this._transformQuestion(data);
            case 'derivation':
                return this._transformDerivation(data);
            case 'memorySnapshot':
                return this._transformMemorySnapshot(data);
            case 'eventBatch':
                return this._transformEventBatch(data);
            default:
                return this._transformGeneric(data);
        }
    }

    /**
     * Batch transform multiple data items
     */
    static transformBatch(dataArray, options = {}) {
        if (!Array.isArray(dataArray)) {
            errorHandler.handleError(
                new Error('transformBatch expects an array'),
                { dataArray, options }
            );
            return [];
        }

        const results = [];
        for (let i = 0; i < dataArray.length; i++) {
            const item = dataArray[i];
            try {
                const transformed = this.transform(item, options);
                if (transformed !== null) {
                    results.push(transformed);
                }
            } catch (error) {
                errorHandler.handleError(
                    error,
                    { item, index: i, options, context: 'transformBatch' }
                );
            }
        }
        return results;
    }

    /**
     * Safe transformation that doesn't throw
     */
    static safeTransform(data, options = {}) {
        try {
            return {
                success: true,
                data: this.transform(data, options),
                error: null
            };
        } catch (error) {
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }

    // Individual transformation methods
    static _transformNarseseInput(data) {
        return {
            input: data.input,
            timestamp: Date.now(),
            id: this._generateId('narsese', data)
        };
    }

    static _transformConcept(data) {
        return {
            id: data.term?.toString() || this._generateId('concept', data),
            term: data.term,
            label: data.term?.toString() || 'Unknown Concept',
            type: 'concept',
            priority: data.priority || 0,
            creationTime: Date.now(),
            ...data
        };
    }

    static _transformTask(data) {
        return {
            id: data.task?.id || data.id || this._generateId('task', data),
            task: data.task,
            label: data.task?.toString?.() || data.toString?.() || 'Unknown Task',
            type: 'task',
            priority: data.priority || 0,
            timestamp: Date.now(),
            ...data
        };
    }

    static _transformBelief(data) {
        return {
            id: data.task?.id || data.id || this._generateId('belief', data),
            task: data.task,
            label: data.task?.toString?.() || data.toString?.() || 'Unknown Belief',
            type: 'belief',
            confidence: data.confidence || 0,
            truthValue: data.truthValue || null,
            timestamp: Date.now(),
            ...data
        };
    }

    static _transformQuestion(data) {
        return {
            id: data.task?.id || data.id || this._generateId('question', data),
            task: data.task,
            label: data.task?.toString?.() || data.toString?.() || 'Unknown Question',
            type: 'question',
            timestamp: Date.now(),
            ...data
        };
    }

    static _transformDerivation(data) {
        return {
            id: data.id || this._generateId('derivation', data),
            label: data.toString?.() || 'Unknown Derivation',
            type: 'derivation',
            timestamp: Date.now(),
            ...data
        };
    }

    static _transformMemorySnapshot(data) {
        const concepts = Array.isArray(data.concepts)
            ? data.concepts.map(c => this._transformConcept(c))
            : [];

        return {
            concepts,
            timestamp: Date.now(),
            nodeCount: concepts.length,
            id: this._generateId('snapshot', data)
        };
    }

    static _transformEventBatch(data) {
        const events = Array.isArray(data) ? data : [data];
        return {
            events: events.map(event => this._transformGeneric(event)),
            timestamp: Date.now(),
            id: this._generateId('batch', data)
        };
    }

    static _transformGeneric(data) {
        return {
            ...data,
            id: data.id || this._generateId('generic', data),
            timestamp: data.timestamp || Date.now()
        };
    }

    static _generateId(type, data) {
        if (data?.id) return data.id;
        if (data?.task?.id) return data.task.id;
        if (data?.term) return `${data.term.toString()}_${Date.now()}`;
        return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Data normalization methods
    static normalizeToFormat(data, targetFormat) {
        switch (targetFormat) {
            case 'flat':
                return this._normalizeToFlat(data);
            case 'hierarchical':
                return this._normalizeToHierarchical(data);
            case 'standard':
            default:
                return this._normalizeStandard(data);
        }
    }

    static _normalizeToFlat(data) {
        const flat = {};
        const recurse = (current, prop) => {
            if (Object(current) !== current) {
                flat[prop] = current;
            } else if (Array.isArray(current)) {
                current.forEach((item, index) => recurse(item, `${prop}[${index}]`));
            } else {
                Object.keys(current).forEach(key => 
                    recurse(current[key], prop ? `${prop}.${key}` : key)
                );
            }
        };
        recurse(data, '');
        return flat;
    }

    static _normalizeToHierarchical(data) {
        if (Array.isArray(data)) {
            return {
                nodes: data.filter(item => !item.source && !item.target),
                edges: data.filter(item => item.source && item.target)
            };
        }
        return data;
    }

    static _normalizeStandard(data) {
        // Normalize to standard format with consistent structure
        return {
            id: data.id || this._generateId('normalized', data),
            type: data.type || 'unknown',
            data: { ...data },
            timestamp: data.timestamp || Date.now()
        };
    }
}

export default EnhancedDataTransformer;