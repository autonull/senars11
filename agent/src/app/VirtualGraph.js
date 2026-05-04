import {UI_CONSTANTS} from '@senars/core';

export class VirtualGraph {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }

    /**
     * Update the graph state based on incoming message
     */
    updateFromMessage(message) {
        if (!message) {
            return;
        }

        const {type} = message;
        const payload = message.payload || message.data;

        switch (type) {
            case UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_CREATED:
            case UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_ADDED:
            case UI_CONSTANTS.MESSAGE_TYPES.CONCEPT_UPDATED:
                this.addNode(payload, 'concept');
                break;
            case UI_CONSTANTS.MESSAGE_TYPES.TASK_ADDED:
            case UI_CONSTANTS.MESSAGE_TYPES.TASK_INPUT:
            case UI_CONSTANTS.MESSAGE_TYPES.REASONING_DERIVATION:
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
        if (!payload || !payload.concepts) {
            return;
        }

        // Clear existing
        this.nodes.clear();
        this.edges.clear();

        for (const concept of payload.concepts) {
            this.addNode(concept, 'concept');
        }
    }

    addNode(data, defaultType = 'concept') {
        if (!data) {
            return;
        }

        // Unwrap nested data structures common in NAR events
        const actualData = data.task || data.concept || data.derivedTask || data;

        let {id} = actualData;
        let {term} = actualData;

        // Handle object term
        if (typeof term === 'object' && term !== null) {
            // Extract components before flattening term to string
            if (Array.isArray(term._components)) {
                term._components.forEach(comp => {
                    this.addNode({term: comp}, 'concept');
                });
            }
            term = term._name || term.name; // Use name as string representation
        }

        if (!id) {
            id = term;
        }
        if (!id) {
            return;
        }

        // If it's a string, wrap it
        const nodeData = typeof actualData === 'string' ? {term: actualData, id: actualData} : {...actualData};

        // Ensure we store string term if we have it
        if (term && typeof term === 'string') {
            nodeData.term = term;
        }

        // Ensure type
        if (!nodeData.type) {
            nodeData.type = defaultType;
        }

        this.nodes.set(id, nodeData);
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
