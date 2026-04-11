import {mergeConfig} from '../../utils/index.js';
import {CognitiveModule} from './CognitiveModule.js';

const PLANNING_DEFAULTS = {planningStrategy: null, worldModel: null, horizon: 10, planHistoryLimit: 100};

export class PlanningModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(PLANNING_DEFAULTS, config));
        this.currentPlan = null;
        this.planHistory = [];
    }

    async process(input, context = {}) {
        const {goal, state} = context;
        if (!goal) {
            return {plan: null, reason: 'No goal specified'};
        }
        const plan = await this.generatePlan(state, goal);
        if (plan) {
            this.currentPlan = plan;
            this.planHistory.push({plan, timestamp: Date.now()});
            if (this.planHistory.length > this.config.planHistoryLimit) {
                this.planHistory.shift();
            }
        }
        return {plan, goal};
    }

    async generatePlan(state, goal) {
        if (this.config.planningStrategy && this.config.worldModel) {
            return this.config.planningStrategy.plan(state, this.config.worldModel, this.config.horizon);
        }
        return this.greedyPlan(state, goal);
    }

    async greedyPlan(state, goal) {
        const plan = [];
        let currentState = state;
        for (let i = 0; i < this.config.horizon; i++) {
            const action = await this.selectBestAction(currentState, goal);
            plan.push(action);
            currentState = this.simulateStep(currentState, action);
            if (this.isGoalAchieved(currentState, goal)) {
                break;
            }
        }
        return plan.length > 0 ? plan : null;
    }

    async selectBestAction(state, goal) {
        return Math.floor(Math.random() * 4);
    }

    simulateStep(state, action) {
        return state;
    }

    isGoalAchieved(state, goal) {
        return false;
    }

    getCurrentPlan() {
        return this.currentPlan;
    }

    replan() {
        this.currentPlan = null;
        return this;
    }
}
