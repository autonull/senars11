import {Knowledge} from './Knowledge.js';
import {DataTableKnowledge} from './DataTableKnowledge.js';
import {
    DependencyGraphKnowledge,
    DirectoryStructureKnowledge,
    FileAnalysisKnowledge,
    FlexibleDataTableKnowledge,
    TestResultKnowledge
} from './SoftwareKnowledge.js';

const KNOWLEDGE_REGISTRY = new Map();

const SOFTWARE_TYPES = Object.freeze({
    fileAnalysis: FileAnalysisKnowledge,
    testResult: TestResultKnowledge,
    directoryStructure: DirectoryStructureKnowledge,
    dependencyGraph: DependencyGraphKnowledge,
    flexibleDataTable: FlexibleDataTableKnowledge
});

const AUTO_DETECT_RULES = [
    {test: d => d.fileDetails || d.fileAnalysis?.length > 0, type: 'fileAnalysis'},
    {test: d => d.individualTestResults, type: 'testResult'},
    {test: d => d.directoryStats, type: 'directoryStructure'},
    {test: d => d.dependencyGraph, type: 'dependencyGraph'}
];

export class KnowledgeFactory {
    static registerKnowledgeType(type, knowledgeClass) {
        if (!(knowledgeClass.prototype instanceof Knowledge)) {
            throw new Error('Knowledge class must extend the Knowledge base class');
        }
        KNOWLEDGE_REGISTRY.set(type, knowledgeClass);
    }

    static createKnowledge(type, data, options = {}) {
        const KnowledgeClass = KNOWLEDGE_REGISTRY.get(type);
        if (!KnowledgeClass) {
            throw new Error(`Unknown knowledge type: ${type}. Available types: ${[...KNOWLEDGE_REGISTRY.keys()].join(', ')}`);
        }
        return new KnowledgeClass(data, options);
    }

    static createGenericKnowledge(data, tableName = 'generic_data', options = {}) {
        return new DataTableKnowledge(data, tableName, options);
    }

    static autoDetectKnowledge(data, name = '', options = {}) {
        if (!data) {
            return null;
        }
        const detected = AUTO_DETECT_RULES.find(({test}) => test(data));
        if (detected) {
            return this.createKnowledge(detected.type, data, options);
        }
        return new DataTableKnowledge(data, name || 'auto_detected', options);
    }

    static getAvailableTypes() {
        return [...KNOWLEDGE_REGISTRY.keys()];
    }

    static initializeSoftwareTypes() {
        Object.entries(SOFTWARE_TYPES).forEach(([type, klass]) => {
            this.registerKnowledgeType(type, klass);
        });
    }
}

KnowledgeFactory.initializeSoftwareTypes();