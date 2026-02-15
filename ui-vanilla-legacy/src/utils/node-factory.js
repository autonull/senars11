import configManager from '../config/config-manager.js';

/**
 * NodeFactory - Creates consistent node objects for the graph visualization
 */
class NodeFactory {
    static create(type, data, customProps = {}) {
        const id = customProps.id || this._generateId(type, data);
        const label = customProps.label || this._generateLabel(type, data);
        
        const node = {
            id,
            label,
            type,
            data,
            ...customProps
        };

        // Apply styling based on type
        Object.assign(node, this._getStyleForType(type));

        return node;
    }

    static _generateId(type, data) {
        if (data?.task?.id) {
            return data.task.id;
        } else if (data?.term) {
            return data.term.toString();
        } else if (data?.input) {
            return `input_${Date.now()}`;
        } else if (data?.id) {
            return data.id;
        } else {
            return `${type}_${Date.now()}`;
        }
    }

    static _generateLabel(type, data) {
        if (data?.task?.toString) {
            return data.task.toString();
        } else if (data?.task) {
            return data.task;
        } else if (data?.term?.toString) {
            return data.term.toString();
        } else if (data?.input?.toString) {
            return data.input.toString();
        } else if (data?.toString) {
            return data.toString();
        } else {
            return type.charAt(0).toUpperCase() + type.slice(1);
        }
    }

    static _getStyleForType(type) {
        const nodeShapes = configManager.getNodeShapes();
        const nodeColors = configManager.getNodeColors();

        return {
            shape: nodeShapes[type] || 'ellipse',
            color: nodeColors[type] || '#3399FF'
        };
    }

    static createConcept(data) {
        return this.create('concept', data);
    }

    static createTask(data) {
        return this.create('task', data);
    }

    static createBelief(data) {
        return this.create('belief', data);
    }

    static createDerivation(data) {
        return this.create('derivation', data);
    }

    static createQuestion(data) {
        return this.create('question', data);
    }

    static createInputTask(data) {
        return this.create('input_task', data);
    }

    static createProcessedTask(data) {
        return this.create('processed_task', data);
    }

    static createReasoningStep(data) {
        return this.create('reasoning_step', data);
    }
}

export default NodeFactory;