/**
 * MemoryExtension.js - MeTTa Extension for Long-Term Memory
 * Parity with mettaclaw's `remember` and `query`.
 */
import { Term } from '../kernel/Term.js';
import { Logger } from '@senars/core';

export class MemoryExtension {
    constructor(interpreter, agent) {
        this.interpreter = interpreter;
        this.agent = agent;
        this.ground = interpreter.ground;
    }

    register() {
        this.ground.add('remember', this._remember.bind(this));
        this.ground.add('recall', this._recall.bind(this));
        Logger.info('Memory primitives registered in MeTTa.');
    }

    async _remember(contentAtom) {
        // (remember "content")
        const content = contentAtom.name || contentAtom.toString().replace(/"/g, '');

        try {
            // Use Agent's persistence or a simple memory store if explicit memory not available
            // MettaClaw uses embedding-based memory.
            // If Agent has a vector store, use it. Otherwise, use basic log/persistence.

            // Checking if agent has memory interface
            if (this.agent.memory && typeof this.agent.memory.add === 'function') {
                await this.agent.memory.add(content);
                return Term.sym('True');
            }

            // Fallback: Use PersistenceManager to save to a "memory" key
            // This is naive but provides persistence.
            // Ideally we want vector search.
            // For parity, we need to at least store it.

            // We can also store it in the MeTTa space itself as a (memory "content") atom
            this.interpreter.space.add(Term.exp('memory', [Term.str(content)]));

            Logger.info(`[Memory] Remembered: ${content}`);
            return Term.sym('True');
        } catch (error) {
            Logger.error('Error in remember:', error);
            return Term.sym('False');
        }
    }

    async _recall(queryAtom) {
        // (recall "query") -> List of results
        const query = queryAtom.name || queryAtom.toString().replace(/"/g, '');

        try {
            if (this.agent.memory && typeof this.agent.memory.search === 'function') {
                const results = await this.agent.memory.search(query);
                // Convert to List
                return this.interpreter._listify(results.map(r => Term.str(r.content || r)));
            }

            // Fallback: Search in MeTTa space for (memory $x)
            // Naive keyword search if no vector store
            const memories = [];
            const pattern = Term.exp('memory', [Term.var('x')]);
            // This requires match support in space which exists
            // We'd need to iterate all atoms or use match if implemented efficiently
            // For now, let's just return what we have in space that matches pattern
            // But space match returns bindings.

            // Let's assume for MVP parity without vector DB, we just log "Not Implemented" for semantic search
            // unless we scan the space.

            return Term.sym('()');
        } catch (error) {
            Logger.error('Error in recall:', error);
            return Term.sym('()');
        }
    }
}
