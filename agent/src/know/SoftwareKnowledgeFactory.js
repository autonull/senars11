import {KnowledgeFactory} from './KnowledgeFactory.js';
import {
    DependencyGraphKnowledge,
    DirectoryStructureKnowledge,
    FileAnalysisKnowledge,
    TestResultKnowledge
} from './SoftwareKnowledge.js';

export class SoftwareKnowledgeFactory {
    static createSelfAnalysisKnowledge(type, data, options = {}) {
        return KnowledgeFactory.createKnowledge(type, data, options);
    }

    static autoDetectSelfAnalysisKnowledge(data, name = '', options = {}) {
        if (!data) {
            return null;
        }

        if (data.fileDetails || (data.fileAnalysis && Array.isArray(data.fileAnalysis))) {
            return new FileAnalysisKnowledge(data, options);
        } else if (data.individualTestResults) {
            return new TestResultKnowledge(data, options);
        } else if (data.directoryStats) {
            return new DirectoryStructureKnowledge(data, options);
        } else if (data.dependencyGraph) {
            return new DependencyGraphKnowledge(data, options);
        } else {
            return KnowledgeFactory.autoDetectKnowledge(data, name, options);
        }
    }
}