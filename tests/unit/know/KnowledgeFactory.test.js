/**
 * @jest-environment jsdom
 */
// Mock browser APIs before any imports
if (typeof window !== 'undefined') {
    window.URL = window.URL || {};
    window.URL.createObjectURL = window.URL.createObjectURL || function() { return 'mock-url'; };
    window.URL.revokeObjectURL = window.URL.revokeObjectURL || function() {};
}

// Mock danfojs — heavy browser deps (plotly, mapbox-gl, tensorflow) can't run in jsdom
jest.mock('danfojs', () => ({
    DataFrame: class MockDataFrame {
        constructor(data) { this._data = data || []; }
        get values() { return Array.isArray(this._data) ? this._data : []; }
        get columns() { return this._data?.length > 0 ? Object.keys(this._data[0]) : []; }
    }
}));

import {Knowledge, KnowledgeFactory} from '../../../agent/src/know/index.js';

class TestKnowledge extends Knowledge {
    async toTasks() {
        return this.data ? [`<test --> ${this.data.value}>. %1.00;0.90%`] : [];
    }

    async getItems() {
        return this.data ? [this.data] : [];
    }

    async getSummary() {
        return {type: 'test', data: this.data};
    }

    async createRelationships() {
        return [];
    }
}

describe('KnowledgeFactory', () => {
    const typeName = `test-${Math.random().toString(36).substring(7)}`;

    test('register and create', () => {
        KnowledgeFactory.registerKnowledgeType(typeName, TestKnowledge);
        expect(() => KnowledgeFactory.createKnowledge(typeName, {value: 'test'})).not.toThrow();
        expect(KnowledgeFactory.getAvailableTypes()).toContain(typeName);
    });

    test('unknown type throws', () => {
        expect(() => KnowledgeFactory.createKnowledge('unknown-type-xyz', {})).toThrow(/Unknown knowledge type/);
    });

    test('invalid inheritance throws', () => {
        expect(() => KnowledgeFactory.registerKnowledgeType('invalid', class {
        }))
            .toThrow('Knowledge class must extend the Knowledge base class');
    });

    test('autoDetectKnowledge', () => {
        const knowledge = KnowledgeFactory.autoDetectKnowledge({key: 'value'});
        expect(knowledge.constructor.name).toBe('DataTableKnowledge');
        expect(KnowledgeFactory.autoDetectKnowledge(null)).toBeNull();
    });
});
