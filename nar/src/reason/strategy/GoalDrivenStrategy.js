import {PrologStrategy} from './PrologStrategy.js';
import {Task} from '../../task/Task.js';

export class GoalDrivenStrategy extends PrologStrategy {
    constructor(config = {}) {
        super({
            ...config,
            name: 'GoalDrivenStrategy',
            maxPlanDepth: config.maxPlanDepth ?? 10,
            maxPlanSteps: config.maxPlanSteps ?? 20,
        });
        this.name = 'GoalDrivenStrategy';
        this.planCache = new Map();
    }

    async selectSecondaryPremises(primaryPremise) {
        return primaryPremise.isGoal()
            ? this.findGoalSupportingPremises(primaryPremise)
            : super.selectSecondaryPremises(primaryPremise);
    }

    async findGoalSupportingPremises(goalTask) {
        const queryTask = goalTask.clone({punctuation: '?', truth: null});
        const solutions = await this._resolveGoal(queryTask);
        return solutions.map(({task}) => task);
    }

    async synthesizePlan(goal) {
        if (!goal.isGoal()) throw new Error('synthesizePlan requires a goal task');

        const cacheKey = goal.term.toString();
        const cached = this.planCache.get(cacheKey);
        if (cached) return cached;

        const plan = [];
        await this._buildPlan(goal, plan, new Set(), 0);

        if (plan.length > 0) this.planCache.set(cacheKey, plan);
        return plan;
    }

    async _buildPlan(currentGoal, plan, visited, depth) {
        if (depth >= this.config.maxPlanDepth ||
            plan.length >= this.config.maxPlanSteps) return;

        const goalKey = currentGoal.term.toString();
        if (visited.has(goalKey)) return;
        visited.add(goalKey);

        const supportingPremises = await this.findGoalSupportingPremises(currentGoal);

        for (const premise of supportingPremises) {
            if (premise.isBelief()) {
                plan.push(premise);
            } else if (premise.term.operator === '==>') {
                const [condition, consequent] = premise.term.components;
                const matchResult = this.unifier.match(currentGoal.term, consequent);

                if (matchResult.success) {
                    const subgoalTerm = this.unifier.applySubstitution(condition, matchResult.substitution);
                    const subgoal = new Task({
                        term: subgoalTerm,
                        punctuation: '!',
                        truth: currentGoal.truth,
                        budget: currentGoal.budget
                    });

                    await this._buildPlan(subgoal, plan, visited, depth + 1);
                    plan.push(premise);
                }
            }

            if (plan.length >= this.config.maxPlanSteps) break;
        }
    }

    async executePlan(plan) {
        return [...plan];
    }

    clearPlanCache() {
        this.planCache.clear();
    }

    getStatus() {
        return {
            ...super.getStatus(),
            type: 'GoalDrivenStrategy',
            maxPlanDepth: this.config.maxPlanDepth,
            maxPlanSteps: this.config.maxPlanSteps,
            cachedPlans: this.planCache.size
        };
    }
}
