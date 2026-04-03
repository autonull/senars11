/**
 * SemanticStrategy.js
 *
 * A strategy that uses vector embeddings to find semantically similar premises.
 * It wraps the EmbeddingLayer to provide fuzzy matching capabilities.
 */

import {PremiseFormationStrategy} from './PremiseFormationStrategy.js';

export class SemanticStrategy extends PremiseFormationStrategy {
    constructor(embeddingLayer, config = {}) {
        super({priority: config.priority ?? 0.7, ...config});
        this._name = 'Semantic';
        this.embeddings = embeddingLayer;
        this.threshold = config.threshold ?? 0.7;
        this.maxCandidates = config.maxCandidates ?? 5;
    }

    /**
     * Generate candidates based on semantic similarity.
     * @param {Task} primaryTask - The task to match against
     * @param {Object} context - Context containing memory
     * @yields {Task} Semantically similar tasks
     */
    async* generateCandidates(primaryTask, context) {
        if (!this.embeddings || !context.memory) return;

        const term = primaryTask.term;
        const termString = term.toString();

        // Query the embedding layer for similar terms
        // Assuming EmbeddingLayer has a findSimilar method or similar capability
        // If not, we might need to iterate or use a vector index if available

        // For now, we'll assume the memory has a way to retrieve terms, and we filter by similarity
        // Ideally, this should be backed by a Vector Index in Memory

        // Fallback: If EmbeddingLayer supports direct query
        if (this.embeddings.findSimilar) {
            const similarTerms = await this.embeddings.findSimilar(termString, this.maxCandidates);

            for (const match of similarTerms) {
                if (match.similarity < this.threshold) continue;

                // Find tasks in memory related to this term
                const concept = context.memory.concepts.get(match.term);
                if (concept) {
                    for (const belief of concept.beliefs) {
                        yield belief;
                    }
                }
            }
        }
    }
}
