import {Knowing} from '../../../agent/src/know/Knowing.js';
import {Knowledge} from '../../../agent/src/know/index.js';

class SimpleTestKnowledge extends Knowledge {
    async toTasks() {
        return this.data?.tasks || [];
    }

    async getItems() {
        return this.data?.items || [];
    }

    async getSummary() {
        return {data: this.data};
    }

    async createRelationships() {
        return this.data?.relationships || [];
    }
}

describe('Knowing System', () => {
    let knowing;
    beforeEach(() => {
        knowing = new Knowing();
    });

    test('initialization', () => {
        expect(knowing.getStats()).toMatchObject({
            totalKnowledgeItems: 0, totalTasks: 0, totalRelationships: 0
        });
    });

    test('add knowledge', async () => {
        await knowing.addKnowledge(new SimpleTestKnowledge({tasks: ['<test --> value>. %1.00;0.90%']}));
        expect(knowing.getStats().totalKnowledgeItems).toBe(1);
    });

    test('query and find', async () => {
        await knowing.addKnowledge(new SimpleTestKnowledge({type: 'test'}));
        expect(knowing.query(k => k instanceof SimpleTestKnowledge)).toHaveLength(1);
        expect(knowing.findByType('SimpleTestKnowledge')).toHaveLength(1);
    });

    test('get tasks and relationships', async () => {
        await knowing.addKnowledge(new SimpleTestKnowledge({
            tasks: ['<t1 --> v>. %1.0;0.9%', '<t2 --> v>. %0.5;0.9%'],
            relationships: ['<r1 --> r2>. %1.0;0.9%']
        }));

        expect(await knowing.getAllTasks()).toHaveLength(2);
        expect(await knowing.getAllRelationships()).toHaveLength(1);
    });

    test('clear', async () => {
        await knowing.addKnowledge(new SimpleTestKnowledge({items: [1]}));
        knowing.clear();
        expect(knowing.getStats().totalKnowledgeItems).toBe(0);
    });

    test('invalid input throws', async () => {
        await expect(knowing.addKnowledge('invalid')).rejects.toThrow('Invalid knowledge object');
    });
});
