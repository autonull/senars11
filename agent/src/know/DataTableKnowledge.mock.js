/**
 * Mock DataTableKnowledge — avoids loading danfojs
 */
import { Knowledge } from './Knowledge.js';

export class DataTableKnowledge extends Knowledge {
    constructor(data = null, tableName = 'data', options = {}) {
        super(data, options);
        this.tableName = tableName;
    }

    async initDataTable(data) {
        this.dataTable = data || this.data;
    }

    async toTasks() {
        return this.dataTable ? [`<DataTable --> ${this.tableName}>. %1.00;0.90%`] : [];
    }

    async getItems() {
        return this.dataTable ? [this.dataTable] : [];
    }

    async getSummary() {
        return {
            type: 'data-table',
            tableName: this.tableName,
            rowCount: Array.isArray(this.dataTable) ? this.dataTable.length : 0
        };
    }

    async createRelationships() {
        return [];
    }
}
