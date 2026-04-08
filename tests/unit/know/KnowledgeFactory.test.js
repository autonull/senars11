/**
 * @jest-environment jsdom
 */
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
