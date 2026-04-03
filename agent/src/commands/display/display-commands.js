import { AgentCommand } from '../AgentCommand.js';

export class ConceptsCommand extends AgentCommand {
    constructor() { super('concepts', 'List concepts', 'concepts [term]'); }
    async _executeImpl(agent, ...args) {
        const concepts = agent.getConceptPriorities();
        if (concepts.length === 0) return 'No concepts.';
        if (args.length > 0) {
            const concept = concepts.find(c => c.term === args[0]);
            if (!concept) return `Concept '${args[0]}' not found.`;
            return `Concept: ${concept.term}\nPriority: ${concept.priority.toFixed(3)}\nActivation: ${concept.activation.toFixed(3)}\nQuality: ${concept.quality.toFixed(3)}\nTasks: ${concept.totalTasks}`;
        }
        const list = concepts.slice(0, 20).map(c =>
            `${c.term.padEnd(30)} P:${c.priority.toFixed(3)} A:${c.activation.toFixed(3)} Tasks:${c.totalTasks}`
        ).join('\n');
        return `Concepts:\n${list}${concepts.length > 20 ? `\n... and ${concepts.length - 20} more` : ''}`;
    }
}

export class TasksCommand extends AgentCommand {
    constructor() { super('tasks', 'List tasks', 'tasks [term]'); }
    async _executeImpl(agent, ...args) {
        let tasks = [];
        if (agent.inputQueue?.getAllTasks) {
            tasks.push(...agent.inputQueue.getAllTasks().map(item => ({ task: item.task, source: 'Input' })));
        }
        let focus = agent.focus ?? agent.componentManager?.getComponent('focus');
        if (focus?.getTasks) {
            tasks.push(...focus.getTasks(50).map(t => ({ task: t, source: 'Focus' })));
        }
        if (args.length > 0) {
            const term = args[0];
            tasks = tasks.filter(item => item.task.term?.toString().includes(term));
        }
        if (tasks.length === 0) return 'No tasks found.';

        const uniqueTasks = new Map();
        tasks.forEach(item => {
            const key = this.#formatTask(item.task);
            if (!uniqueTasks.has(key)) uniqueTasks.set(key, item);
        });

        const sortedTasks = [...uniqueTasks.values()].slice(0, 30);
        return `Tasks (Top ${sortedTasks.length}):\n${sortedTasks.map(item => `[${item.source}] ${this.#formatTask(item.task)}`).join('\n')}`;
    }

    #formatTask(task) {
        try { return require('../../../core/src/util/FormattingUtils.js').FormattingUtils.formatTask(task); }
        catch { return String(task); }
    }
}

export class BeliefsCommand extends AgentCommand {
    constructor() { super('beliefs', 'List beliefs', 'beliefs'); }
    async _executeImpl(agent) {
        const beliefs = agent.getBeliefs();
        return `Beliefs:\n${beliefs.slice(0, 20).map(t => this.#formatTask(t)).join('\n')}`;
    }
    #formatTask(task) {
        try { return require('../../../core/src/util/FormattingUtils.js').FormattingUtils.formatTask(task); }
        catch { return String(task); }
    }
}

export class QuestionsCommand extends AgentCommand {
    constructor() { super('questions', 'List questions', 'questions'); }
    async _executeImpl(agent) {
        const questions = agent.getQuestions();
        return `Questions:\n${questions.slice(0, 20).map(t => this.#formatTask(t)).join('\n')}`;
    }
    #formatTask(task) {
        try { return require('../../../core/src/util/FormattingUtils.js').FormattingUtils.formatTask(task); }
        catch { return String(task); }
    }
}

export class HistoryCommand extends AgentCommand {
    constructor() { super('history', 'Show command history', 'history [n]'); }
    async _executeImpl(agent, ...args) {
        const n = args[0] ? parseInt(args[0]) : 10;
        return agent.getHistory().slice(-n).map((h, i) => `${i + 1}. ${h}`).join('\n');
    }
}

export class LastCommand extends AgentCommand {
    constructor() { super('last', 'Re-run last command', 'last'); }
    async _executeImpl(agent) {
        const history = agent.getHistory();
        if (history.length === 0) return 'No history.';
        return await agent.processInput(history[history.length - 1]);
    }
}

export class ThemeCommand extends AgentCommand {
    constructor() { super('theme', 'Change theme', 'theme <name>'); }
    async _executeImpl() { return 'Theme change requested (UI only).'; }
}

export class ModeCommand extends AgentCommand {
    constructor() { super('mode', 'Show or change input mode', 'mode [agent|narsese]'); }
    async _executeImpl(agent, ...args) {
        if (args.length === 0) return 'Current mode: Use UI layer to check current mode';
        const newMode = args[0].toLowerCase();
        return ['agent', 'narsese'].includes(newMode)
            ? `Mode switched to: ${newMode}`
            : 'Invalid mode. Use "agent" or "narsese".';
    }
}

export class NaturalCommand extends AgentCommand {
    constructor() { super('natural', 'Switch to natural language mode', 'natural'); }
    async _executeImpl() { return 'Switched to natural language (agent) mode'; }
}

export class NarseseCommand extends AgentCommand {
    constructor() { super('narsese', 'Switch to Narsese mode', 'narsese'); }
    async _executeImpl() { return 'Switched to Narsese mode'; }
}

export class VolCommand extends AgentCommand {
    constructor() { super('vol', 'Set volume', 'vol <n>'); }
    async _executeImpl() { return 'Volume set (simulated).'; }
}

export class ViewCommand extends AgentCommand {
    constructor() { super('view', 'Control UI views', 'view <mode|component> [args]'); }
    async _executeImpl(agent, ...args) {
        if (args.length === 0) return 'Usage: view <mode|component> [args]';
        if (!agent.uiState) return 'UI State not available in this agent instance.';
        agent.uiState.viewMode = args[0];
        agent.emit('ui.view.change', { mode: args[0], args: args.slice(1) });
        return `View switched to: ${args[0]}`;
    }
}
