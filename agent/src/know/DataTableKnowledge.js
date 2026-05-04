import {Knowledge} from './Knowledge.js';

let dfd = null;

async function loadDanfojs() {
    if (!dfd) {
        // Allow test mocks to override
        if (globalThis.__mockDanfojs) {
            dfd = globalThis.__mockDanfojs;
        } else {
            dfd = await import('danfojs');
        }
    }
    return dfd;
}

export class DataTableKnowledge extends Knowledge {
    constructor(data = null, tableName = 'data', options = {}) {
        super(data, options);
        this.tableName = tableName;
    }

    async initDataTable(data) {
        const dfd = await loadDanfojs();
        if (Array.isArray(data)) {
            this.df = new dfd.DataFrame(data);
        } else if (data && typeof data === 'object') {
            this.df = new dfd.DataFrame([this.flattenObject(data)]);
        }
    }

    async initDataFrame() {
        await this.initDataTable(this.data);
    }

    flattenObject(obj, prefix = '') {
        return Object.entries(obj).reduce((acc, [key, value]) => {
            const newKey = prefix ? `${prefix}_${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(acc, this.flattenObject(value, newKey));
            } else {
                acc[newKey] = value;
            }
            return acc;
        }, {});
    }

    async processData() {
        if (!this.df) {
            await this.initDataTable(this.data);
        }
        let processedDf = this.df;
        if (this.options.handleMissingValues) {
            processedDf = processedDf?.dropna?.();
        }
        if (this.options.removeDuplicates) {
            processedDf = processedDf?.dropDuplicates?.();
        }
        this.df = processedDf;
        return this.df;
    }

    _rowToObject(row, cols) {
        return Object.fromEntries(
            (cols || []).map((col, idx) => [col, (row || [])[idx]])
        );
    }

    async toTasks() {
        if (!this.df) {
            await this.processData();
        }
        const rows = this.df?.values || [];
        const cols = this.df?.columns || [];

        const tasks = await Promise.all(
            rows.map((row, i) => this.rowToTask(this._rowToObject(row, cols), i))
        );

        return tasks.filter(t => t !== null);
    }

    async rowToTask(row, index) {
        const keys = Object.keys(row);
        if (keys.length > 0) {
            const firstKey = keys[0];
            const value = row[firstKey];
            const identifier = `${firstKey}_${index}`.replace(/[^\w\s-]/g, '_').replace(/\s+/g, '_');
            return `<("${identifier}" --> ${firstKey}) --> ${value}>. %0.50;0.90%`;
        }
        return null;
    }

    async getItems() {
        if (!this.df) {
            await this.processData();
        }
        const rows = this.df?.values || [];
        const cols = this.df?.columns || [];

        return rows.map(row => this._rowToObject(row, cols));
    }

    async getSummary() {
        if (!this.df) {
            await this.processData();
        }
        const shape = this.df?.shape || [0, 0];
        const allCols = this.df?.columns || [];

        const summary = {
            tableName: this.tableName,
            rowCount: shape[0],
            columnCount: shape[1],
            columns: allCols,
            statistics: {}
        };

        const numericCols = allCols.filter(col => {
            try {
                const colData = this.df?.column?.(col);
                return colData && ['int32', 'float32', 'float64'].includes(colData.dtype);
            } catch (e) {
                return false;
            }
        });

        const statsPromises = numericCols.map(async col => {
            try {
                const colData = this.df?.column?.(col);
                if (!colData) {
                    return null;
                }

                const [mean, std, min, max] = await Promise.all([
                    colData.mean?.(),
                    colData.std?.(),
                    colData.min?.(),
                    colData.max?.()
                ]);

                if (mean !== undefined && std !== undefined && min !== undefined && max !== undefined) {
                    return {
                        col,
                        stats: {
                            mean: parseFloat(mean.toFixed(4)),
                            std: parseFloat(std.toFixed(4)),
                            min: parseFloat(min.toFixed(4)),
                            max: parseFloat(max.toFixed(4))
                        }
                    };
                }
            } catch (e) {
                console.warn(`Could not calculate statistics for column ${col}: ${e.message}`);
            }
            return null;
        });

        const results = await Promise.all(statsPromises);
        results.forEach(res => {
            if (res) {
                summary.statistics[res.col] = res.stats;
            }
        });

        return summary;
    }

    async createRelationships() {
        return [];
    }

    async describe() {
        if (!this.df) {
            await this.processData();
        }
        return await this.df?.describe?.();
    }
}
