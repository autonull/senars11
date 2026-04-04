import {defaultNarseseTemplate, TruthValueUtils} from './NarseseTemplate.js';
import {Logger} from '@senars/core';

export class Knowledge {
    constructor(data = null, options = {}) {
        if (this.constructor === Knowledge) {
            throw new Error('Cannot instantiate abstract class Knowledge');
        }
        this.data = data;
        this.options = options;
        this.df = null;
        this.templateAPI = defaultNarseseTemplate;
    }

    toTasks() {
        throw new Error('toTasks method must be implemented in concrete class');
    }

    getItems() {
        throw new Error('getItems method must be implemented in concrete class');
    }

    getSummary() {
        throw new Error('getSummary method must be implemented in concrete class');
    }

    createRelationships() {
        throw new Error('createRelationships method must be implemented in concrete class');
    }

    async initDataFrame() {
        throw new Error('initDataFrame must be implemented in concrete class that uses danfojs');
    }

    getDataFrame() {
        return this.df;
    }

    async transform(transformFn) {
        if (!this.df) await this.initDataFrame();
        return transformFn(this.df);
    }

    async filter(condition) {
        if (!this.df) await this.initDataFrame();
        return this.df?.query ? this.df.query(condition) : [];
    }

    async groupBy(column) {
        if (!this.df) await this.initDataFrame();
        return this.df?.groupby ? this.df.groupby(column) : {};
    }

    async aggregate(stats) {
        if (!this.df) await this.initDataFrame();
        const result = {};
        for (const [statName, statFn] of Object.entries(stats)) {
            result[statName] = await statFn(this.df);
        }
        return result;
    }

    async createTasksWithTemplate(templateName, data, options = {}) {
        try {
            return this.templateAPI.executeTemplate(templateName, data, options);
        } catch (error) {
            Logger.error(`Template error: ${error.message}`);
            return null;
        }
    }

    async createBatchTasksWithTemplate(operations) {
        return this.templateAPI.executeBatch(operations);
    }

    registerCustomTemplate(name, templateFn) {
        this.templateAPI.registerTemplate(name, templateFn);
    }
}

export {TruthValueUtils};