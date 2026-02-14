import {UI_CONSTANTS} from '../util/UIConstants.js';

export class VirtualGraph {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }

    /**
     * Update the graph state based on incoming message
     */
    updateFromMessage(message) {
        if (!message) return;

        const {type, payload} = message;

        switch (type) {
            case UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_CREATED:
            case UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_ADDED:
            case UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_UPDATED:
                this.addNode(payload, 'concept');
                break;
            case UI_CONSTANTS.MESSAGE_TYPES.TASK_ADDED:
            case UI_CONSTANTS.MESSAGE_TYPES.TASK_INPUT:
                this.addNode(payload, 'task');
                break;
            case UI_CONSTANTS.MESSAGE_TYPES.QUESTION_ANSWERED:
                if (payload) {
                    const {answer, question} = payload;
                    this.addNode({
                        term: answer || question || 'Answer',
                        type: 'question'
                    }, 'question');
                }
                break;
            case UI_CONSTANTS.MESSAGE_TYPES.MEMORY_SNAPSHOT:
                this.updateFromSnapshot(payload);
                break;
        }
    }

    updateFromSnapshot(payload) {
        if (!payload || !payload.concepts) return;

        // Clear existing
        this.nodes.clear();
        this.edges.clear();

        for (const concept of payload.concepts) {
            this.addNode(concept, 'concept');
        }
    }

    addNode(data, defaultType = 'concept') {
        if (!data) return;

        const id = data.id || data.term;
        if (!id) return;

        // If it's a string, wrap it
        const nodeData = typeof data === 'string' ? {term: data, id: data} : {...data};

        // Ensure type
        if (!nodeData.type) nodeData.type = defaultType;

        this.nodes.set(id, nodeData);

        // Track edges if links exist in data?
        // GraphManager doesn't seem to extract edges from concept payload automatically in addNode.
        // But let's check GraphManager.addNode.
    }

    getNode(idOrTerm) {
        return this.nodes.get(idOrTerm);
    }

    getNodes() {
        return Array.from(this.nodes.values());
    }

    hasNode(idOrTerm) {
        return this.nodes.has(idOrTerm);
    }
}
