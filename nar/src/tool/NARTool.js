/**
 * @file src/tool/NARTool.js
 * @description Tool that allows LLM to control and interact with the NAR system
 */

import {BaseTool} from './BaseTool.js';
import {PrologParser} from '../parser/PrologParser.js';
import {PrologStrategy} from '@senars/nar';

export class NARTool extends BaseTool {
    constructor(nar = null) {
        super();
        this.nar = nar;
        // Use NAR's term factory if available to ensure term compatibility
        const termFactory = nar && nar._termFactory ? nar._termFactory : null;
        this.prologParser = new PrologParser(termFactory);

        this.name = 'nar';
        this.description = 'Control and interact with the NARS reasoning system';
        this.schema = {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['add_belief', 'add_goal', 'query', 'step', 'get_beliefs', 'get_goals', 'assert_prolog', 'query_prolog'],
                    description: 'The action to perform on the NAR system. Choose add_belief to add a belief statement in Narsese format, add_goal to add a goal statement, query to query the system, step to execute a single reasoning cycle, get_beliefs to retrieve current beliefs, get_goals to retrieve current goals, assert_prolog to assert a Prolog fact or rule, or query_prolog to query the system using Prolog.'
                },
                content: {
                    type: 'string',
                    description: 'The Narsese content for the action (e.g., "(a --> b)." for beliefs, "(a --> b)! " for goals). Required for add_belief, add_goal, and query actions.'
                }
            },
            required: ['action'],
            additionalProperties: false
        };

        this._actionHandlers = {
            'add_belief': {handler: this._addBelief.bind(this), requiresContent: true},
            'add_goal': {handler: this._addGoal.bind(this), requiresContent: true},
            'query': {handler: this._query.bind(this), requiresContent: true},
            'step': {handler: this._step.bind(this), requiresContent: false},
            'get_beliefs': {handler: this._getBeliefs.bind(this), requiresContent: false},
            'get_goals': {handler: this._getGoals.bind(this), requiresContent: false},
            'assert_prolog': {handler: this._assertProlog.bind(this), requiresContent: true},
            'query_prolog': {handler: this._queryProlog.bind(this), requiresContent: true},
        };
    }

    get prologStrategy() {
        if (this._prologStrategy) return this._prologStrategy;

        // Try to find it in the strategies list
        this._prologStrategy = this.nar?.streamReasoner?.strategy?.strategies?.find(s => s instanceof PrologStrategy);

        // Also check if the main strategy IS the PrologStrategy (edge case)
        if (!this._prologStrategy && this.nar?.streamReasoner?.strategy instanceof PrologStrategy) {
            this._prologStrategy = this.nar.streamReasoner.strategy;
        }

        return this._prologStrategy;
    }

    async execute(args) {
        if (!this.nar) return {error: 'NAR system not initialized'};

        const {action, content} = args;
        const actionHandler = this._getActionHandler(action);

        if (!actionHandler) return {error: `Unknown action: ${action}`};

        try {
            if (actionHandler.requiresContent && !content) {
                return {error: `Content required for ${action}`};
            }
            return await actionHandler.handler(content);
        } catch (error) {
            return {error: `Tool execution failed: ${error.message}`};
        }
    }

    _getActionHandler(action) {
        return this._actionHandlers[action];
    }

    async _assertProlog(content) {
        if (!this.prologStrategy) {
            return {error: 'PrologStrategy not available.'};
        }
        try {
            const tasks = this.prologParser.parseProlog(content);
            this.prologStrategy.updateKnowledgeBase(tasks);
            return {success: true, message: 'Prolog assertion successful.'};
        } catch (error) {
            this.nar?.logError?.('NARTool _assertProlog error', error);
            return {success: false, error: `Failed to assert Prolog: ${error.message}`};
        }
    }

    async _queryProlog(content) {
        if (!this.prologStrategy) {
            return {error: 'PrologStrategy not available.'};
        }
        try {
            const tasks = this.prologParser.parseProlog(content);
            if (tasks.length === 0) {
                return {success: false, message: 'No query to execute.'};
            }
            const result = await this.nar.ask(tasks[0]);
            return {success: result && result.length > 0, result};
        } catch (error) {
            this.nar?.logError?.('NARTool _queryProlog error', error);
            return {success: false, error: `Failed to query Prolog: ${error.message}`};
        }
    }

    async _addBelief(content) {
        await this._executeNARInputCommand(content);
        return {success: true, message: `Belief added: ${content}`};
    }

    async _addGoal(content) {
        await this._executeNARInputCommand(content);
        return {success: true, message: `Goal added: ${content}`};
    }

    async _query(content) {
        let questionContent = content.trim();
        if (!['.', '!', '?'].some(p => questionContent.endsWith(p))) {
            questionContent += '?';
        }

        const result = await this._executeNARInputCommand(questionContent);
        return {success: true, result: result ?? `Query "${questionContent}" processed`};
    }

    async _step() {
        await this._runReasoningCycle();
        return {success: true, message: 'Single reasoning step executed'};
    }

    async _getBeliefs() {
        const beliefs = await this.nar.getBeliefs?.() ?? [];
        return {success: true, beliefs};
    }

    async _getGoals() {
        const goals = await this.nar.getGoals?.() ?? [];
        return {success: true, goals};
    }

    async _executeNARInputCommand(content) {
        const inputMethod = this.nar.input ?? this.nar.addInput ?? this.nar.execute;
        if (!inputMethod) throw new Error('NAR system has no available input method');

        const result = await inputMethod.call(this.nar, content);
        await this._runReasoningCycle();
        return result;
    }

    async _runReasoningCycle() {
        if (this.nar.cycle) {
            await this.nar.cycle(1); // Execute 1 cycle
        } else if (this.nar.step) {
            await this.nar.step();
        }
    }
}
