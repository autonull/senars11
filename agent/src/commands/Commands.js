/**
 * Standardized Command Interface and Implementations
 */

import {handleError} from '../../../core/src/util/ErrorHandler.js';
import {fileURLToPath} from 'url';
import {basename, dirname, join, resolve} from 'path';
import {promises as fs} from 'fs';
import {FormattingUtils} from '../../../core/src/util/FormattingUtils.js';
import {z} from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, '../../../examples');

// Helper to generate banner
const createBanner = (title) => {
    const width = 60;
    const border = '═'.repeat(width);
    const padding = Math.max(0, Math.floor((width - title.length) / 2));
    const paddedTitle = ' '.repeat(padding) + title + ' '.repeat(width - title.length - padding);
    return `\n${border}\n${paddedTitle}\n${border}\n`;
};

// Base class for all commands
export class AgentCommand {
    constructor(name, description, usage) {
        this.name = name;
        this.description = description;
        this.usage = usage;
    }

    async execute(agent, ...args) {
        try {
            return await this._executeImpl(agent, ...args);
        } catch (error) {
            return handleError(error, `${this.name} command`, `❌ Error executing ${this.name} command`);
        }
    }

    async _executeImpl(agent, ...args) {
        throw new Error(`_executeImpl not implemented for command: ${this.name}`);
    }
}

// Registry
export class AgentCommandRegistry {
    constructor() {
        this.commands = new Map();
    }

    register(command) {
        if (!(command instanceof AgentCommand)) {
            throw new Error('Command must be an instance of AgentCommand');
        }
        this.commands.set(command.name, command);
    }

    get(name) {
        return this.commands.get(name);
    }

    getAll() {
        return Array.from(this.commands.values());
    }

    async execute(name, agent, ...args) {
        const command = this.get(name);
        if (!command) {
            return `❌ Unknown command: ${name}`;
        }
        return await command.execute(agent, ...args);
    }

    getHelp() {
        const commands = this.getAll();
        if (commands.length === 0) return 'No commands registered.';
        return commands.map(cmd =>
            `  ${cmd.name.padEnd(12)} - ${cmd.description}`
        ).join('\n');
    }
}

// --- Agent Commands ---

export class AgentCreateCommand extends AgentCommand {
    constructor() {
        super('agent', 'Manage agent status', 'agent [status]');
    }

    async _executeImpl(agent, action, ...rest) {
        if (!action || action === 'status') {
            return this._getAgentStatus(agent);
        }
        return `Action '${action}' not supported. Use 'agent status'.`;
    }

    async _getAgentStatus(agent) {
        const status = {
            id: agent.id,
            isRunning: agent.isRunning,
            cycleCount: agent.cycleCount,
            beliefs: agent.getBeliefs ? agent.getBeliefs().length : 0,
            goals: agent.getGoals ? agent.getGoals().length : 0,
            inputQueueSize: agent.inputQueue ? agent.inputQueue.size() : 0
        };
        return `📊 Agent Status: ${agent.id}
  Running: ${status.isRunning}
  Cycles: ${status.cycleCount}
  Beliefs: ${status.beliefs}
  Goals: ${status.goals}
  Input Queue: ${status.inputQueueSize}`;
    }
}

export class GoalCommand extends AgentCommand {
    constructor() {
        super('goal', 'Manage goals', 'goal [list|<narsese>]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) return 'Usage: goal <narsese_goal> or goal list';
        if (args[0] === 'list') {
            const goals = agent.getGoals ? agent.getGoals() : [];
            if (goals.length === 0) return 'No goals in the system.';
            const goalList = goals.slice(0, 10).map((goal, index) => `  ${index + 1}. ${FormattingUtils.formatTask(goal)}`).join('\n');
            return goals.length > 10 ? `🎯 Goals:\n${goalList}\n  ... and ${goals.length - 10} more` : `🎯 Goals:\n${goalList}`;
        }
        const narsese = args.join(' ');
        const goalTask = narsese.trim().endsWith('!') ? narsese : `<${narsese}>!`;
        await agent.input(goalTask);
        return `🎯 Goal processed: ${goalTask}`;
    }
}

export class PlanCommand extends AgentCommand {
    constructor() {
        super('plan', 'Generate a plan using LM', 'plan <description>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) return 'Usage: plan <description>';
        if (!agent.ai) return '❌ No AI Client enabled.';
        console.log(`[PlanCommand] Generating plan for: "${args.join(' ')}"`);

        try {
            const {object} = await agent.ai.generateObject(
                `Generate a step-by-step plan to achieve: "${args.join(' ')}"`,
                z.object({
                    steps: z.array(z.string()).describe('List of steps to execute the plan'),
                    estimatedTime: z.string().describe('Estimated time to complete')
                })
            );
            return `📋 Generated Plan (${object.estimatedTime}):\n${object.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
        } catch (e) {
            return `❌ Planning failed: ${e.message}`;
        }
    }
}

export class ThinkCommand extends AgentCommand {
    constructor() {
        super('think', 'Have agent think about a topic', 'think <topic>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) return 'Usage: think <topic>';
        if (!agent.ai) return '❌ No AI Client enabled.';
        console.log(`[ThinkCommand] Thinking about: "${args.join(' ')}"`);
        const {text} = await agent.ai.generate(`Reflect on: "${args.join(' ')}"`, {temperature: 0.8});
        return `💭 Reflection:\n${text}`;
    }
}

export class ReasonCommand extends AgentCommand {
    constructor() {
        super('reason', 'Perform reasoning using LM', 'reason <statement>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) return 'Usage: reason <statement>';
        if (!agent.ai) return '❌ No AI Client enabled.';
        console.log(`[ReasonCommand] Reasoning about: "${args.join(' ')}"`);
        const {text} = await agent.ai.generate(`Reason about: "${args.join(' ')}"`, {temperature: 0.3});
        return `🧠 Reasoning Result:\n${text}`;
    }
}

export class LMCommand extends AgentCommand {
    constructor() {
        super('lm', 'Direct LM communication', 'lm <prompt>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length < 1) return 'Usage: lm <prompt>';
        if (!agent.ai) return '❌ No AI Client enabled.';
        console.log(`[LMCommand] Prompting: "${args.join(' ')}"`);
        const {text} = await agent.ai.generate(args.join(' '), {temperature: 0.7});
        return `🤖 LM Response:\n${text}`;
    }
}

export class ProvidersCommand extends AgentCommand {
    constructor() {
        super('providers', 'Manage AI providers', 'providers [list]');
    }

    async _executeImpl(agent, ...args) {
        if (!agent.ai) return '❌ No AI Client enabled.';
        const providers = Array.from(agent.ai.providers.keys());
        if (providers.length === 0) return 'No AI providers registered.';
        const list = providers.map((id, i) => `  ${i + 1}. ${id}${agent.ai.defaultProvider === id ? ' [DEFAULT]' : ''}`).join('\n');
        return `🔌 Providers:\n${list}`;
    }
}

export class ToolsCommand extends AgentCommand {
    constructor() {
        super('tools', 'Show Tools/MCP configuration', 'tools');
    }

    async _executeImpl(agent) {
        let lines = ['🔧 Tools/MCP Configuration:'];
        if (agent.agentLM && agent.agentLM.providers) {
            lines.push(`  Current Agent LM Provider: ${agent.agentLM.providers.defaultProviderId ?? 'Default'}`);
        } else {
            lines.push('  Current Agent LM Provider: None');
        }
        if (agent.nar && typeof agent.nar.getAvailableTools === 'function') {
            const tools = agent.nar.getAvailableTools();
            if (Array.isArray(tools) && tools.length > 0) {
                lines.push(`  NARS Available Tools (${tools.length}):`);
                tools.forEach((t, i) => lines.push(`    ${i + 1}. ${typeof t === 'string' ? t : t.name ?? t.id ?? 'unnamed'}`));
            } else {
                lines.push('  NARS Tools: None available');
            }
        }
        if (agent.agentLM) {
            const pid = agent.agentLM.providers?.defaultProviderId;
            if (pid) {
                const p = agent.agentLM.providers.get(pid);
                const tools = (p && (typeof p.getAvailableTools === 'function' ? p.getAvailableTools() : p.tools)) || [];
                if (tools.length > 0) {
                    lines.push(`  🤖 LM Tools (${tools.length}):`);
                    tools.forEach((t, i) => lines.push(`    ${i + 1}. ${t.name ?? t.constructor.name}: ${t.description ?? ''}`));
                }
            }
        }
        if (agent.nar && agent.nar.mcp) {
            const mcp = agent.nar.mcp.getAvailableTools();
            if (mcp && mcp.allTools && mcp.allTools.length > 0) {
                lines.push(`  MCP Tools (${mcp.allTools.length}):`);
                mcp.allTools.forEach((t, i) => lines.push(`    ${i + 1}. ${typeof t === 'string' ? t : t.name ?? 'unnamed'}`));
            }
        }
        return lines.join('\n');
    }
}

// --- System Commands ---

export class HelpCommand extends AgentCommand {
    constructor() {
        super('help', 'Show available commands', 'help');
    }

    async _executeImpl(agent) {
        return `🤖 Available commands:\n${agent.commandRegistry ? agent.commandRegistry.getHelp() : 'No help available'}`;
    }
}

export class StatusCommand extends AgentCommand {
    constructor() {
        super('stats', 'Show system health', 'stats');
    }

    async _executeImpl(agent) {
        const stats = agent.getStats();
        const ms = stats.memoryStats || {};
        return `📊 System Health:
  Cycles:     ${stats.cycleCount ?? 0}
  Concepts:   ${ms.conceptCount ?? ms.totalConcepts ?? 0}
  Tasks:      ${ms.taskCount ?? ms.totalTasks ?? 0}
  Beliefs:    ${agent.getBeliefs ? agent.getBeliefs().length : 0}
  Avg Conf:   ${(ms.avgConfidence ?? 0).toFixed(3)}`;
    }
}

export class MemoryCommand extends AgentCommand {
    constructor() {
        super('memory', 'Show memory statistics', 'memory');
    }

    async _executeImpl(agent) {
        const stats = agent.getStats();
        const ms = stats.memoryStats || {};
        return `💾 Memory Statistics:
  Concepts: ${ms.conceptCount ?? ms.totalConcepts ?? 0}
  Tasks: ${ms.taskCount ?? ms.totalTasks ?? 0}
  Avg Priority: ${(ms.avgPriority ?? ms.averagePriority ?? 0).toFixed(3)}`;
    }
}

export class TraceCommand extends AgentCommand {
    constructor() {
        super('trace', 'Toggle derivation trace', 'trace [on|off]');
    }

    async _executeImpl(agent, ...args) {
        if (args[0] === 'on') agent.traceEnabled = true;
        else if (args[0] === 'off') agent.traceEnabled = false;
        else agent.traceEnabled = !agent.traceEnabled;

        return `🔍 Trace: ${agent.traceEnabled ? 'ON' : 'OFF'}`;
    }
}

export class MetricsCommand extends AgentCommand {
    constructor() {
        super('metrics', 'Control system metrics collection', 'metrics [on|off]');
    }

    async _executeImpl(agent, ...args) {
        const monitor = agent.metricsMonitor;
        if (!monitor) return '❌ Metrics monitor not available.';

        if (args[0] === 'on') {
            monitor.start();
            return '📊 Metrics collection: ON';
        } else if (args[0] === 'off') {
            monitor.stop();
            return '📊 Metrics collection: OFF';
        }

        return `📊 Metrics collection: ${monitor._reportingInterval ? 'ON' : 'OFF'}`;
    }
}

export class ResetCommand extends AgentCommand {
    constructor() {
        super('reset', 'Reset the system', 'reset');
    }

    async _executeImpl(agent) {
        agent.reset();
        return '🔄 System reset successfully.';
    }
}

export class RestartCommand extends ResetCommand {
    constructor() {
        super('restart', 'Restart the system', 'restart');
    }
}

export class SaveCommand extends AgentCommand {
    constructor() {
        super('save', 'Save state to file', 'save');
    }

    async _executeImpl(agent) {
        const result = await agent.save();
        return `💾 Saved to ${result.identifier} (${result.size} bytes)`;
    }
}

export class LoadCommand extends AgentCommand {
    constructor() {
        super('load', 'Load state from file', 'load <filepath>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) return 'Usage: load <filepath>';
        const filepath = args[0];
        if (filepath.includes('../')) return '❌ Invalid path.';
        const success = await agent.load(filepath);
        return success ? `💾 Loaded from ${filepath}` : '❌ Failed to load.';
    }
}

export class DemoCommand extends AgentCommand {
    constructor() {
        super('demo', 'Run .nars demo', 'demo [name]');
    }

    async _executeImpl(agent, ...args) {
        try {
            const files = (await fs.readdir(EXAMPLES_DIR)).filter(f => f.endsWith('.nars'));

            if (args.length === 0) {
                // List demos
                let output = '🎭 Available Demos:\n';
                for (const file of files) {
                    const content = await fs.readFile(join(EXAMPLES_DIR, file), 'utf-8');
                    const titleMatch = content.match(/^\/\/\s*title:\s*(.*)$/m);
                    const title = titleMatch ? titleMatch[1].trim() : '';
                    const name = basename(file, '.nars');
                    output += `  • ${name.padEnd(20)} ${title}\n`;
                }
                return output;
            }

            const name = args[0];
            const filename = name.endsWith('.nars') ? name : `${name}.nars`;
            const filepath = join(EXAMPLES_DIR, filename);

            return await agent.commandRegistry.execute('run', agent, filepath);
        } catch (error) {
            return `❌ Error accessing demos: ${error.message}`;
        }
    }
}

export class RunCommand extends AgentCommand {
    constructor() {
        super('run', 'Execute .nars file', 'run <path>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) return 'Usage: run <path>';

        // Handle path resolution
        let filepath = args[0];
        if (!filepath.startsWith('/') && !filepath.includes(':')) {
            // Relative path, try resolving from cwd
            filepath = resolve(process.cwd(), filepath);
        }

        try {
            const content = await fs.readFile(filepath, 'utf-8');
            const lines = content.split('\n');
            let output = [`▶️ Executing ${basename(filepath)}...`];

            // Render title banner if present
            const titleMatch = content.match(/^\/\/\s*title:\s*(.*)$/m);
            if (titleMatch) {
                output.push(createBanner(titleMatch[1].trim()));
            }

            // Execute lines
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
                if (trimmed.startsWith('*')) continue; // Ignore legacy control

                if (agent.echo) {
                    output.push(`> ${trimmed}`);
                }

                if (trimmed.startsWith('/')) {
                    // Slash command
                    const [cmd, ...cmdArgs] = trimmed.slice(1).split(' ');
                    const res = await agent.executeCommand(cmd, ...cmdArgs);
                    if (res) output.push(res);
                } else {
                    // Narsese
                    await agent.processInput(trimmed);
                }
            }
            return output.join('\n');
        } catch (error) {
            return `❌ Error executing file ${filepath}: ${error.message}`;
        }
    }
}

export class EchoCommand extends AgentCommand {
    constructor() {
        super('echo', 'Toggle command echo', 'echo [on|off]');
    }

    async _executeImpl(agent, ...args) {
        if (args[0] === 'on') agent.echo = true;
        else if (args[0] === 'off') agent.echo = false;
        else agent.echo = !agent.echo;
        return `Echo: ${agent.echo ? 'ON' : 'OFF'}`;
    }
}

export class QuietCommand extends AgentCommand {
    constructor() {
        super('quiet', 'Toggle quiet mode', 'quiet [on|off]');
    }

    async _executeImpl(agent, ...args) {
        if (args[0] === 'on') agent.quiet = true;
        else if (args[0] === 'off') agent.quiet = false;
        else agent.quiet = !agent.quiet;
        return `Quiet Mode: ${agent.quiet ? 'ON' : 'OFF'}`;
    }
}

export class StepCommand extends AgentCommand {
    constructor() {
        super('step', 'Step inference cycles', 'step [n|duration]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            await agent.step();
            return `Cycle: ${agent.cycleCount}`;
        }

        const arg = args[0];

        // Check for duration (e.g., 200ms, 1s)
        const durationMatch = arg.match(/^(\d+)(ms|s)$/);
        if (durationMatch) {
            let ms = parseInt(durationMatch[1]);
            if (durationMatch[2] === 's') ms *= 1000;
            return agent.startAutoStep(ms);
        }

        // Number of steps
        const steps = parseInt(arg);
        if (!isNaN(steps)) {
            await agent.runCycles(steps);
            return `Executed ${steps} cycles. Cycle: ${agent.cycleCount}`;
        }

        if (arg === 'off') {
            agent._stopRun();
            return 'Auto-step stopped.';
        }

        return 'Usage: step [n] or step [duration] (e.g. 200ms) or step off';
    }
}

export class CycleCommand extends AgentCommand {
    constructor() {
        super('cycle', 'Show current cycle', 'cycle');
    }

    async _executeImpl(agent) {
        return `Cycle: ${agent.cycleCount}`;
    }
}

export class ConceptsCommand extends AgentCommand {
    constructor() {
        super('concepts', 'List concepts', 'concepts [term]');
    }

    async _executeImpl(agent, ...args) {
        const concepts = agent.getConceptPriorities();
        if (concepts.length === 0) return 'No concepts.';

        if (args.length > 0) {
            const term = args[0];
            const concept = concepts.find(c => c.term === term);
            if (!concept) return `Concept '${term}' not found.`;
            return `Concept: ${term}\nPriority: ${concept.priority.toFixed(3)}\nActivation: ${concept.activation.toFixed(3)}\nQuality: ${concept.quality.toFixed(3)}\nTasks: ${concept.totalTasks}`;
        }

        const list = concepts.slice(0, 20).map(c =>
            `${c.term.padEnd(30)} P:${c.priority.toFixed(3)} A:${c.activation.toFixed(3)} Tasks:${c.totalTasks}`
        ).join('\n');
        return `Concepts:\n${list}${concepts.length > 20 ? `\n... and ${concepts.length - 20} more` : ''}`;
    }
}

export class TasksCommand extends AgentCommand {
    constructor() {
        super('tasks', 'List tasks', 'tasks [term]');
    }

    async _executeImpl(agent, ...args) {
        let tasks = [];

        // 1. Get tasks from Input Queue
        if (agent.inputQueue && agent.inputQueue.getAllTasks) {
            tasks.push(...agent.inputQueue.getAllTasks().map(item => {
                // InputQueue stores {task: Task, ...}
                const task = item.task;
                // We add a temporary property for display source, carefully not to mutate original if it matters
                // but formatTask probably won't show it. We'll prepend it in output.
                return {task, source: 'Input'};
            }));
        }

        // 2. Get tasks from Focus Buffer
        // agent.focus or agent.componentManager.getComponent('focus')
        // Agent extends NAR, so it has this._focus, but maybe not public getter 'focus'.
        // We'll try dynamic access or component manager.
        let focus = agent.focus;
        if (!focus && agent.componentManager) {
            focus = agent.componentManager.getComponent('focus');
        }

        if (focus && focus.getTasks) {
            tasks.push(...focus.getTasks(50).map(t => ({task: t, source: 'Focus'})));
        }

        // Filter by term if provided
        if (args.length > 0) {
            const term = args[0];
            tasks = tasks.filter(item => item.task.term && item.task.term.toString().includes(term));
        }

        if (tasks.length === 0) return 'No tasks found.';

        // Deduplicate based on task string representation
        const uniqueTasks = new Map();
        tasks.forEach(item => {
            const t = item.task;
            const key = FormattingUtils.formatTask(t);
            if (!uniqueTasks.has(key)) uniqueTasks.set(key, item);
        });

        const sortedTasks = Array.from(uniqueTasks.values()).slice(0, 30); // Limit output

        const list = sortedTasks.map(item =>
            `[${item.source}] ${FormattingUtils.formatTask(item.task)}`
        ).join('\n');

        return `Tasks (Top ${sortedTasks.length}):\n${list}`;
    }
}

export class ContinueCommand extends AgentCommand {
    constructor() {
        super('continue', 'Resume continuous execution', 'continue');
    }

    async _executeImpl(agent) {
        return agent.startAutoStep(10);
    }
}

export class BeliefsCommand extends AgentCommand {
    constructor() {
        super('beliefs', 'List beliefs', 'beliefs');
    }

    async _executeImpl(agent) {
        const beliefs = agent.getBeliefs();
        const list = beliefs.slice(0, 20).map(t => FormattingUtils.formatTask(t)).join('\n');
        return `Beliefs:\n${list}`;
    }
}

export class QuestionsCommand extends AgentCommand {
    constructor() {
        super('questions', 'List questions', 'questions');
    }

    async _executeImpl(agent) {
        const questions = agent.getQuestions();
        const list = questions.slice(0, 20).map(t => FormattingUtils.formatTask(t)).join('\n');
        return `Questions:\n${list}`;
    }
}

export class HistoryCommand extends AgentCommand {
    constructor() {
        super('history', 'Show command history', 'history [n]');
    }

    async _executeImpl(agent, ...args) {
        const n = args[0] ? parseInt(args[0]) : 10;
        const history = agent.getHistory();
        return history.slice(-n).map((h, i) => `${i + 1}. ${h}`).join('\n');
    }
}

export class LastCommand extends AgentCommand {
    constructor() {
        super('last', 'Re-run last command', 'last');
    }

    async _executeImpl(agent) {
        const history = agent.getHistory();
        if (history.length === 0) return 'No history.';
        const last = history[history.length - 1];
        return await agent.processInput(last);
    }
}

export class ThemeCommand extends AgentCommand {
    constructor() {
        super('theme', 'Change theme', 'theme <name>');
    }

    async _executeImpl(agent, ...args) {
        return 'Theme change requested (UI only).';
    }
}

export class ModeCommand extends AgentCommand {
    constructor() {
        super('mode', 'Show or change input mode', 'mode [agent|narsese]');
    }

    async _executeImpl(agent, ...args) {
        // This command is handled specially in UI layer, but we provide basic functionality
        if (args.length === 0) {
            // Return current mode - since this depends on UI state, return a message
            return 'ℹ️ Current mode: Use UI layer to check current mode';
        }

        const newMode = args[0].toLowerCase();
        if (['agent', 'narsese'].includes(newMode)) {
            return `🔄 Mode switched to: ${newMode}`;
        } else {
            return '❌ Invalid mode. Use "agent" or "narsese".';
        }
    }
}

export class NaturalCommand extends AgentCommand {
    constructor() {
        super('natural', 'Switch to natural language mode', 'natural');
    }

    async _executeImpl(agent, ...args) {
        // This command is handled specially in UI layer, but we provide basic functionality
        return '🔄 Switched to natural language (agent) mode';
    }
}

export class NarseseCommand extends AgentCommand {
    constructor() {
        super('narsese', 'Switch to Narsese mode', 'narsese');
    }

    async _executeImpl(agent, ...args) {
        // This command is handled specially in UI layer, but we provide basic functionality
        return '🔄 Switched to Narsese mode';
    }
}

export class VolCommand extends AgentCommand {
    constructor() {
        super('vol', 'Set volume', 'vol <n>');
    }

    async _executeImpl(agent, ...args) {
        // Ignore volume per instruction, but ack
        return 'Volume set (simulated).';
    }
}

export class ViewCommand extends AgentCommand {
    constructor() {
        super('view', 'Control UI views', 'view <mode|component> [args]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) return 'Usage: view <mode|component> [args]';

        const mode = args[0];
        if (!agent.uiState) {
            return '❌ UI State not available in this agent instance.';
        }

        agent.uiState.viewMode = mode;

        // Notify UI about state change if mechanism exists, but changing state object might be enough
        // if UI observes it or if we emit event.
        agent.emit('ui.view.change', {mode, args: args.slice(1)});

        return `👀 View switched to: ${mode}`;
    }
}
