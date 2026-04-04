import {TermCategorization} from './TermCategorization.js';

export class MemoryExporter {
    constructor() {}

    export(format, getAllConcepts, getStats, config) {
        const data = {
            concepts: getAllConcepts(),
            stats: getStats(),
            config,
            timestamp: Date.now()
        };

        switch (format.toLowerCase()) {
            case 'json': return JSON.stringify(data, null, 2);
            case 'csv': return this._exportToCSV(data);
            default: return data;
        }
    }

    _exportToCSV(data) {
        let csv = 'Term,Category,Complexity,Activation,CreatedAt\n';
        for (const concept of data.concepts) {
            const term = concept.term.name || concept.term.toString();
            const category = TermCategorization.getTermCategory(concept.term);
            const complexity = TermCategorization.getTermComplexity(concept.term);
            const activation = concept.activation || 0;
            const createdAt = concept.createdAt || 0;
            csv += `"${term}",${category},${complexity},${activation},${createdAt}\n`;
        }
        return csv;
    }
}
