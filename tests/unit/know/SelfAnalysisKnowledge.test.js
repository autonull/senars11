/**
 * @jest-environment jsdom
 */
// Mock browser APIs before any imports
if (typeof window !== 'undefined') {
    window.URL = window.URL || {};
    window.URL.createObjectURL = window.URL.createObjectURL || function() { return 'mock-url'; };
    window.URL.revokeObjectURL = window.URL.revokeObjectURL || function() {};
}

import {
    DependencyGraphKnowledge,
    DirectoryStructureKnowledge,
    FileAnalysisKnowledge,
    TestResultKnowledge
} from '../../../agent/src/know/SoftwareKnowledge.js';
import {SoftwareKnowledgeFactory} from '../../../agent/src/know/SoftwareKnowledgeFactory.js';

describe('Self-Analysis Knowledge', () => {
    const cases = [
        {
            name: 'FileAnalysisKnowledge',
            Class: FileAnalysisKnowledge,
            data: {fileDetails: [{path: 't.js', directory: 'src', lines: 10, size: 100, complexity: {cyclomatic: 1}}]},
            factoryData: {fileDetails: [{path: 't.js', lines: 10}]}
        },
        {
            name: 'TestResultKnowledge',
            Class: TestResultKnowledge,
            data: {individualTestResults: [{name: 't1', status: 'passed', duration: 10, suite: 's1'}]},
            factoryData: {individualTestResults: [{name: 't1'}]}
        },
        {
            name: 'DirectoryStructureKnowledge',
            Class: DirectoryStructureKnowledge,
            data: {directoryStats: {'src': {path: 'src', files: 1, lines: 10}}},
            factoryData: {directoryStats: {'src': {}}}
        },
        {
            name: 'DependencyGraphKnowledge',
            Class: DependencyGraphKnowledge,
            data: {dependencyGraph: {'f1.js': ['d1.js']}},
            factoryData: {dependencyGraph: {'f1': []}}
        }
    ];

    test.each(cases)('$name processing', async ({Class, data}) => {
        const knowledge = new Class(data);
        expect(await knowledge.getItems()).toHaveLength(1);
        expect(await knowledge.toTasks()).toBeInstanceOf(Array);
    });

    test.each(cases)('Factory auto-detect $name', ({name, factoryData}) => {
        const knowledge = SoftwareKnowledgeFactory.autoDetectSelfAnalysisKnowledge(factoryData);
        expect(knowledge.constructor.name).toBe(name);
    });
});
