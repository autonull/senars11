import {AgentCommand} from '../AgentCommand.js';
import {FormattingUtils} from '@senars/core';

export class AgentCreateCommand extends AgentCommand {
    constructor() {
        super('agent', 'Manage agent status', 'agent [status]');
    }

    async _executeImpl(agent, action) {
        if (!action || action === 'status') {
            return this.#getStatus(agent);
        }
        return `Action '${action}' not supported. Use 'agent status'.`;
    }

    #getStatus(agent) {
        return `Agent Status: ${agent.id}
  Running: ${agent.isRunning}
  Cycles: ${agent.cycleCount}
  Beliefs: ${agent.getBeliefs ? agent.getBeliefs().length : 0}
  Goals: ${agent.getGoals ? agent.getGoals().length : 0}
  Input Queue: ${agent.inputQueue ? agent.inputQueue.size() : 0}`;
    }
}

export class GoalCommand extends AgentCommand {
    constructor() {
        super('goal', 'Manage goals', 'goal [list|<narsese>]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) {
            return 'Usage: goal <narsese_goal> or goal list';
        }
        if (args[0] === 'list') {
            const goals = agent.getGoals ? agent.getGoals() : [];
            if (goals.length === 0) {
                return 'No goals in the system.';
            }
            const list = goals.slice(0, 10).map((g, i) => `  ${i + 1}. ${this.#formatTask(g)}`).join('\n');
            return `Goals:\n${list}${goals.length > 10 ? `\n  ... and ${goals.length - 10} more` : ''}`;
        }
        const narsese = args.join(' ');
        const goalTask = narsese.trim().endsWith('!') ? narsese : `<${narsese}>!`;
        await agent.input(goalTask);
        return `Goal processed: ${goalTask}`;
    }

    #formatTask(task) {
        try {
            return FormattingUtils.formatTask(task);
        } catch {
            return String(task);
        }
    }
}

export class PlanCommand extends AgentCommand {
    constructor() {
        super('plan', 'Generate a plan using LM', 'plan <description>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) {
            return 'Usage: plan <description>';
        }
        if (!agent.ai) {
            return 'No AI Client enabled.';
        }
        const {z} = await import('zod');
        const {object} = await agent.ai.generateObject(
            `Generate a step-by-step plan to achieve: "${args.join(' ')}"`,
            z.object({
                steps: z.array(z.string()).describe('List of steps to execute the plan'),
                estimatedTime: z.string().describe('Estimated time to complete')
            })
        );
        return `Generated Plan (${object.estimatedTime}):\n${object.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }
}

export class ThinkCommand extends AgentCommand {
    constructor() {
        super('think', 'Have agent think about a topic', 'think <topic>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) {
            return 'Usage: think <topic>';
        }
        if (!agent.ai) {
            return 'No AI Client enabled.';
        }
        const {text} = await agent.ai.generate(`Reflect on: "${args.join(' ')}"`, {temperature: 0.8});
        return `Reflection:\n${text}`;
    }
}

export class ReasonCommand extends AgentCommand {
    constructor() {
        super('reason', 'Perform reasoning using LM', 'reason <statement>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) {
            return 'Usage: reason <statement>';
        }
        if (!agent.ai) {
            return 'No AI Client enabled.';
        }
        const {text} = await agent.ai.generate(`Reason about: "${args.join(' ')}"`, {temperature: 0.3});
        return `Reasoning Result:\n${text}`;
    }
}

export class LMCommand extends AgentCommand {
    constructor() {
        super('lm', 'Direct LM communication', 'lm <prompt>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) {
            return 'Usage: lm <prompt>';
        }
        if (!agent.ai) {
            return 'No AI Client enabled.';
        }
        const {text} = await agent.ai.generate(args.join(' '), {temperature: 0.7});
        return `LM Response:\n${text}`;
    }
}

export class ProvidersCommand extends AgentCommand {
    constructor() {
        super('providers', 'Manage AI providers', 'providers [list]');
    }

    async _executeImpl(agent) {
        if (!agent.ai) {
            return 'No AI Client enabled.';
        }
        const providers = [...agent.ai.providers.keys()];
        if (providers.length === 0) {
            return 'No AI providers registered.';
        }
        return `Providers:\n${providers.map((id, i) => `  ${i + 1}. ${id}${agent.ai.defaultProvider === id ? ' [DEFAULT]' : ''}`).join('\n')}`;
    }
}

export class ToolsCommand extends AgentCommand {
    constructor() {
        super('tools', 'Show Tools/MCP configuration', 'tools');
    }

    async _executeImpl(agent) {
        const lines = ['Tools/MCP Configuration:'];
        if (agent.agentLM?.providers?.defaultProviderId) {
            lines.push(`  Current Agent LM Provider: ${agent.agentLM.providers.defaultProviderId}`);
        } else {
            lines.push('  Current Agent LM Provider: None');
        }
        if (agent.nar?.getAvailableTools) {
            const tools = agent.nar.getAvailableTools();
            if (Array.isArray(tools) && tools.length > 0) {
                lines.push(`  NARS Available Tools (${tools.length}):`);
                tools.forEach((t, i) => lines.push(`    ${i + 1}. ${typeof t === 'string' ? t : t.name ?? t.id ?? 'unnamed'}`));
            } else {
                lines.push('  NARS Tools: None available');
            }
        }
        if (agent.agentLM) {
            const p = agent.agentLM.providers?.get(agent.agentLM.providers?.defaultProviderId);
            const tools = p?.getAvailableTools?.() ?? p?.tools ?? [];
            if (tools.length > 0) {
                lines.push(`  LM Tools (${tools.length}):`);
                tools.forEach((t, i) => lines.push(`    ${i + 1}. ${t.name ?? t.constructor.name}: ${t.description ?? ''}`));
            }
        }
        if (agent.nar?.mcp) {
            const mcp = agent.nar.mcp.getAvailableTools();
            if (mcp?.allTools?.length > 0) {
                lines.push(`  MCP Tools (${mcp.allTools.length}):`);
                mcp.allTools.forEach((t, i) => lines.push(`    ${i + 1}. ${typeof t === 'string' ? t : t.name ?? 'unnamed'}`));
            }
        }
        return lines.join('\n');
    }
}
