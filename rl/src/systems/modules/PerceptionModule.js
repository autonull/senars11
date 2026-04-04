import { mergeConfig } from '../../utils/ConfigHelper.js';
import { CognitiveModule } from './CognitiveModule.js';

const PERCEPTION_DEFAULTS = { featureExtractors: [], attentionMechanism: null };

export class PerceptionModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(PERCEPTION_DEFAULTS, config));
        this.features = new Map();
        this.symbols = new Map();
    }
    async process(observation, context = {}) {
        const features = await this.extractFeatures(observation);
        const attended = this.config.attentionMechanism
            ? await this.config.attentionMechanism.attend(features, observation)
            : features;
        const symbols = await this.liftToSymbols(attended);
        this.setState('lastObservation', observation);
        this.setState('lastFeatures', features);
        this.setState('lastSymbols', symbols);
        return { features, symbols, attended };
    }
    async extractFeatures(observation) {
        const results = await Promise.all(
            this.config.featureExtractors.map(async extractor => {
                try { return await extractor(observation); }
                catch { return null; }
            })
        );
        const filtered = results.filter(r => r !== null);
        return filtered.length === 1 ? filtered[0] : filtered;
    }
    async liftToSymbols(features) {
        if (!Array.isArray(features)) return new Map();
        const symbols = new Map();
        features.forEach((f, i) => {
            if (Math.abs(f) > 0.5) symbols.set(`f${i}`, { feature: i, value: f, salience: Math.abs(f) });
        });
        return symbols;
    }
}
