import { mergeConfig } from '../../utils/ConfigHelper.js';
import { CognitiveModule } from './CognitiveModule.js';

const ACTION_DEFAULTS = { explorationStrategy: null, actionSpace: null, actionHistoryLimit: 1000 };

export class ActionModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(ACTION_DEFAULTS, config));
        this.actionHistory = [];
        this.lastAction = null;
    }
    async process(input, context = {}) {
        const { plan, policy, state } = context;
        let action, source;
        if (plan?.length > 0) { action = plan.shift(); source = 'plan'; }
        else if (policy) { action = await this.selectFromPolicy(policy, state); source = 'policy'; }
        else { action = await this.explore(state); source = 'explore'; }
        this.lastAction = action;
        this.actionHistory.push({ action, timestamp: Date.now() });
        if (this.actionHistory.length > this.config.actionHistoryLimit) this.actionHistory.shift();
        return { action, source };
    }
    async selectFromPolicy(policy, state) { return typeof policy.act === 'function' ? policy.act(state) : policy(state); }
    async explore(state) {
        if (this.config.explorationStrategy) {
            const actionValues = await this.getActionValues(state);
            return this.config.explorationStrategy.select(actionValues, state);
        }
        return this.randomAction();
    }
    async getActionValues(state) { return Array(this.config.actionSpace?.n ?? 4).fill(0); }
    randomAction() { return Math.floor(Math.random() * (this.config.actionSpace?.n ?? 4)); }
    getLastAction() { return this.lastAction; }
}
