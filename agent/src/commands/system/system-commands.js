import { AgentCommand } from '../AgentCommand.js';

export class HelpCommand extends AgentCommand {
    constructor() { super('help', 'Show available commands', 'help'); }
    async _executeImpl(agent) {
        return `Available commands:\n${agent.commandRegistry ? agent.commandRegistry.getHelp() : 'No help available'}`;
    }
}

export class StatusCommand extends AgentCommand {
    constructor() { super('stats', 'Show system health', 'stats'); }
    async _executeImpl(agent) {
        const stats = agent.getStats();
        const ms = stats.memoryStats || {};
        return `System Health:
  Cycles:     ${stats.cycleCount ?? 0}
  Concepts:   ${ms.conceptCount ?? ms.totalConcepts ?? 0}
  Tasks:      ${ms.taskCount ?? ms.totalTasks ?? 0}
  Beliefs:    ${agent.getBeliefs ? agent.getBeliefs().length : 0}
  Avg Conf:   ${(ms.avgConfidence ?? 0).toFixed(3)}`;
    }
}

export class MemoryCommand extends AgentCommand {
    constructor() { super('memory', 'Show memory statistics', 'memory'); }
    async _executeImpl(agent) {
        const stats = agent.getStats();
        const ms = stats.memoryStats || {};
        return `Memory Statistics:
  Concepts: ${ms.conceptCount ?? ms.totalConcepts ?? 0}
  Tasks: ${ms.taskCount ?? ms.totalTasks ?? 0}
  Avg Priority: ${(ms.avgPriority ?? ms.averagePriority ?? 0).toFixed(3)}`;
    }
}

export class TraceCommand extends AgentCommand {
    constructor() { super('trace', 'Toggle derivation trace', 'trace [on|off]'); }
    async _executeImpl(agent, ...args) {
        agent.traceEnabled = args[0] === 'on' ? true : args[0] === 'off' ? false : !agent.traceEnabled;
        return `Trace: ${agent.traceEnabled ? 'ON' : 'OFF'}`;
    }
}

export class MetricsCommand extends AgentCommand {
    constructor() { super('metrics', 'Control system metrics collection', 'metrics [on|off]'); }
    async _executeImpl(agent, ...args) {
        const monitor = agent.metricsMonitor;
        if (!monitor) return 'Metrics monitor not available.';
        if (args[0] === 'on') { monitor.start(); return 'Metrics collection: ON'; }
        if (args[0] === 'off') { monitor.stop(); return 'Metrics collection: OFF'; }
        return `Metrics collection: ${monitor._reportingInterval ? 'ON' : 'OFF'}`;
    }
}

export class ResetCommand extends AgentCommand {
    constructor() { super('reset', 'Reset the system', 'reset'); }
    async _executeImpl(agent) { agent.reset(); return 'System reset successfully.'; }
}

export class RestartCommand extends ResetCommand {
    constructor() { super('restart', 'Restart the system', 'restart'); }
}

export class SaveCommand extends AgentCommand {
    constructor() { super('save', 'Save state to file', 'save'); }
    async _executeImpl(agent) {
        const result = await agent.save();
        return `Saved to ${result.identifier} (${result.size} bytes)`;
    }
}

export class LoadCommand extends AgentCommand {
    constructor() { super('load', 'Load state from file', 'load <filepath>'); }
    async _executeImpl(agent, ...args) {
        if (args.length === 0) return 'Usage: load <filepath>';
        const filepath = args[0];
        if (filepath.includes('../')) return 'Invalid path.';
        const success = await agent.load(filepath);
        return success ? `Loaded from ${filepath}` : 'Failed to load.';
    }
}

export class DemoCommand extends AgentCommand {
    constructor() { super('demo', 'Run .nars demo', 'demo [name]'); }
    async _executeImpl(agent, ...args) {
        const { fileURLToPath } = await import('url');
        const { basename, resolve, join } = await import('path');
        const { promises: fs } = await import('fs');
        const __dirname = (await import('path')).dirname(fileURLToPath(import.meta.url));
        const EXAMPLES_DIR = resolve(__dirname, '../../../../examples');

        try {
            const files = (await fs.readdir(EXAMPLES_DIR)).filter(f => f.endsWith('.nars'));
            if (args.length === 0) {
                let output = 'Available Demos:\n';
                for (const file of files) {
                    const content = await fs.readFile(join(EXAMPLES_DIR, file), 'utf-8');
                    const titleMatch = content.match(/^\/\/\s*title:\s*(.*)$/m);
                    const title = titleMatch ? titleMatch[1].trim() : '';
                    output += `  - ${basename(file, '.nars').padEnd(20)} ${title}\n`;
                }
                return output;
            }
            const name = args[0];
            const filename = name.endsWith('.nars') ? name : `${name}.nars`;
            return await agent.commandRegistry.execute('run', agent, join(EXAMPLES_DIR, filename));
        } catch (error) {
            return `Error accessing demos: ${error.message}`;
        }
    }
}

export class RunCommand extends AgentCommand {
    constructor() { super('run', 'Execute .nars file', 'run <path>'); }
    async _executeImpl(agent, ...args) {
        if (args.length === 0) return 'Usage: run <path>';
        const { basename, resolve } = await import('path');
        const { promises: fs } = await import('fs');

        let filepath = args[0];
        if (!filepath.startsWith('/') && !filepath.includes(':')) filepath = resolve(process.cwd(), filepath);

        try {
            const content = await fs.readFile(filepath, 'utf-8');
            const lines = content.split('\n');
            const output = [`Executing ${basename(filepath)}...`];

            const titleMatch = content.match(/^\/\/\s*title:\s*(.*)$/m);
            if (titleMatch) output.push(this.#createBanner(titleMatch[1].trim()));

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;
                if (agent.echo) output.push(`> ${trimmed}`);
                if (trimmed.startsWith('/')) {
                    const [cmd, ...cmdArgs] = trimmed.slice(1).split(' ');
                    const res = await agent.executeCommand(cmd, ...cmdArgs);
                    if (res) output.push(res);
                } else {
                    await agent.processInput(trimmed);
                }
            }
            return output.join('\n');
        } catch (error) {
            return `Error executing file ${filepath}: ${error.message}`;
        }
    }

    #createBanner(title) {
        const width = 60;
        const border = '='.repeat(width);
        const padding = Math.max(0, Math.floor((width - title.length) / 2));
        return `\n${border}\n${' '.repeat(padding)}${title}{' '.repeat(width - title.length - padding)}\n${border}\n`;
    }
}

export class ContinueCommand extends AgentCommand {
    constructor() { super('continue', 'Resume continuous execution', 'continue'); }
    async _executeImpl(agent) { return agent.startAutoStep(10); }
}

export class CycleCommand extends AgentCommand {
    constructor() { super('cycle', 'Show current cycle', 'cycle'); }
    async _executeImpl(agent) { return `Cycle: ${agent.cycleCount}`; }
}

export class StepCommand extends AgentCommand {
    constructor() { super('step', 'Step inference cycles', 'step [n|duration]'); }
    async _executeImpl(agent, ...args) {
        if (args.length === 0) { await agent.step(); return `Cycle: ${agent.cycleCount}`; }
        const arg = args[0];
        const durationMatch = arg.match(/^(\d+)(ms|s)$/);
        if (durationMatch) {
            let ms = parseInt(durationMatch[1]);
            if (durationMatch[2] === 's') ms *= 1000;
            return agent.startAutoStep(ms);
        }
        const steps = parseInt(arg);
        if (!isNaN(steps)) { await agent.runCycles(steps); return `Executed ${steps} cycles. Cycle: ${agent.cycleCount}`; }
        if (arg === 'off') { agent._stopRun(); return 'Auto-step stopped.'; }
        return 'Usage: step [n] or step [duration] (e.g. 200ms) or step off';
    }
}

export class EchoCommand extends AgentCommand {
    constructor() { super('echo', 'Toggle command echo', 'echo [on|off]'); }
    async _executeImpl(agent, ...args) {
        agent.echo = args[0] === 'on' ? true : args[0] === 'off' ? false : !agent.echo;
        return `Echo: ${agent.echo ? 'ON' : 'OFF'}`;
    }
}

export class QuietCommand extends AgentCommand {
    constructor() { super('quiet', 'Toggle quiet mode', 'quiet [on|off]'); }
    async _executeImpl(agent, ...args) {
        agent.quiet = args[0] === 'on' ? true : args[0] === 'off' ? false : !agent.quiet;
        return `Quiet Mode: ${agent.quiet ? 'ON' : 'OFF'}`;
    }
}
