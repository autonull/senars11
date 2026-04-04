import { mergeConfig } from '../../utils/ConfigHelper.js';
import { CognitiveModule } from './CognitiveModule.js';

const METACOGNITIVE_DEFAULTS = { selfModel: null, reflectionInterval: 100, reflectionsLimit: 10, recentInsightsLimit: 5 };

export class MetaCognitiveModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(METACOGNITIVE_DEFAULTS, config));
        this.reflections = [];
        this.selfKnowledge = new Map();
        this.stepCount = 0;
    }
    async process(input, context = {}) {
        this.stepCount++;
        if (this.stepCount % this.config.reflectionInterval === 0) await this.reflect(input, context);
        return { selfState: this.monitorSelf(), reflections: this.reflections.slice(-this.config.reflectionsLimit) };
    }
    async reflect(input, context) {
        const reflection = {
            timestamp: Date.now(), step: this.stepCount,
            input: this.summarize(input), context: this.summarize(context),
            insights: await this.generateInsights(input, context)
        };
        this.reflections.push(reflection);
        this.updateSelfKnowledge(reflection);
        this.emit('reflection', reflection);
        return reflection;
    }
    summarize(obj) {
        if (typeof obj !== 'object' || obj === null) return String(obj);
        return JSON.stringify(obj).slice(0, 100);
    }
    async generateInsights(input, context) {
        const insights = [];
        if (context.performance?.trend === 'declining') {
            insights.push({ type: 'warning', message: 'Performance declining, consider strategy change', confidence: 0.7 });
        }
        if (context.lastResult?.success) {
            insights.push({ type: 'success', message: 'Successful episode, analyze contributing factors', confidence: 0.8 });
        }
        return insights;
    }
    updateSelfKnowledge(reflection) {
        reflection.insights.forEach(insight => {
            const key = insight.type;
            const existing = this.selfKnowledge.get(key);
            if (existing) { existing.count++; existing.lastSeen = reflection.timestamp; }
            else this.selfKnowledge.set(key, { ...insight, count: 1, firstSeen: reflection.timestamp, lastSeen: reflection.timestamp });
        });
    }
    monitorSelf() {
        return {
            stepCount: this.stepCount, reflectionCount: this.reflections.length,
            selfKnowledgeSize: this.selfKnowledge.size,
            recentInsights: this.reflections.slice(-this.config.recentInsightsLimit).flatMap(r => r.insights)
        };
    }
    getSelfKnowledge() { return Object.fromEntries(this.selfKnowledge); }
}
