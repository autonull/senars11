const INITIAL_STATS = Object.freeze({
    totalKnowledgeItems: 0,
    totalTasks: 0,
    totalRelationships: 0,
    knowledgeByType: {},
    lastUpdated: null
});

export class Knowing {
    constructor(options = {}) {
        this.knowledgeItems = [];
        this.options = options;
        this.stats = {...INITIAL_STATS};
    }

    async addKnowledge(knowledge) {
        if (!knowledge || typeof knowledge.getItems !== 'function') {
            throw new Error('Invalid knowledge object: must implement Knowledge interface');
        }

        this.knowledgeItems.push(knowledge);
        await this._updateStats();
    }

    async addMultipleKnowledge(knowledgeArray) {
        for (const knowledge of knowledgeArray) {
            await this.addKnowledge(knowledge);
        }
    }

    query(predicate) {
        if (typeof predicate !== 'function') {
            throw new Error('Query predicate must be a function');
        }
        return this.knowledgeItems.filter(knowledge => predicate(knowledge));
    }

    findByType(type) {
        return this.knowledgeItems.filter(knowledge =>
            knowledge.constructor.name === type ||
            knowledge.constructor.name.toLowerCase().includes(type.toLowerCase())
        );
    }

    async getAllTasks() {
        const allTasks = [];
        for (const knowledge of this.knowledgeItems) {
            const tasks = await knowledge.toTasks?.();
            if (Array.isArray(tasks)) {
                allTasks.push(...tasks);
            }
        }
        return allTasks;
    }

    async getAllRelationships() {
        const allRelationships = [];
        for (const knowledge of this.knowledgeItems) {
            const relationships = await knowledge.createRelationships?.();
            if (Array.isArray(relationships)) {
                allRelationships.push(...relationships);
            }
        }
        return allRelationships;
    }

    getAllKnowledge() {
        return [...this.knowledgeItems];
    }

    getStats() {
        return {...this.stats};
    }

    async _updateStats() {
        this.stats.totalKnowledgeItems = this.knowledgeItems.length;
        this.stats.totalTasks = 0;
        this.stats.totalRelationships = 0;
        this.stats.knowledgeByType = {};
        this.stats.lastUpdated = new Date().toISOString();

        const statsPromises = this.knowledgeItems.map(async (knowledge) => {
            const typeName = knowledge.constructor.name;

            if (!this.stats.knowledgeByType[typeName]) {
                this.stats.knowledgeByType[typeName] = {count: 0, tasks: 0, relationships: 0};
            }

            this.stats.knowledgeByType[typeName].count++;

            const [tasks, relationships] = await Promise.allSettled([
                knowledge.toTasks?.() || Promise.resolve([]),
                knowledge.createRelationships?.() || Promise.resolve([])
            ]);

            const taskCount = tasks.status === 'fulfilled' && Array.isArray(tasks.value) ? tasks.value.length : 0;
            this.stats.totalTasks += taskCount;
            this.stats.knowledgeByType[typeName].tasks += taskCount;

            const relationshipCount = relationships.status === 'fulfilled' && Array.isArray(relationships.value) ? relationships.value.length : 0;
            this.stats.totalRelationships += relationshipCount;
            this.stats.knowledgeByType[typeName].relationships += relationshipCount;
        });

        await Promise.all(statsPromises);
    }

    async getSummary() {
        await this._updateStats();
        return {
            stats: this.getStats(),
            knowledgeTypes: Object.keys(this.stats.knowledgeByType),
            sampleTasks: (await this.getAllTasks()).slice(0, 5),
            sampleRelationships: (await this.getAllRelationships()).slice(0, 5)
        };
    }

    clear() {
        this.knowledgeItems = [];
        this.stats = {...INITIAL_STATS};
    }

    async export() {
        const exported = {
            metadata: {
                timestamp: new Date().toISOString(),
                knowledgeCount: this.knowledgeItems.length,
                totalTasks: 0,
                totalRelationships: 0
            },
            knowledge: []
        };

        for (const knowledge of this.knowledgeItems) {
            const [summary, items, tasks, relationships] = await Promise.allSettled([
                knowledge.getSummary?.() || Promise.resolve({}),
                knowledge.getItems?.() || Promise.resolve([]),
                knowledge.toTasks?.() || Promise.resolve([]),
                knowledge.createRelationships?.() || Promise.resolve([])
            ]);

            const knowledgeData = {
                type: knowledge.constructor.name,
                summary: summary.status === 'fulfilled' ? summary.value : {},
                items: items.status === 'fulfilled' ? items.value : [],
                tasks: tasks.status === 'fulfilled' ? tasks.value : [],
                relationships: relationships.status === 'fulfilled' ? relationships.value : []
            };

            exported.knowledge.push(knowledgeData);
            exported.metadata.totalTasks += Array.isArray(knowledgeData.tasks) ? knowledgeData.tasks.length : 0;
            exported.metadata.totalRelationships += Array.isArray(knowledgeData.relationships) ? knowledgeData.relationships.length : 0;
        }

        return exported;
    }

    import() {
        return false;
    }
}