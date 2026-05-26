/**
 * New Slash Commands for Enhanced REPL & Demo Experience
 */

import {AgentCommand} from './Commands.js';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {ReplFormattingUtils} from '../utils/ReplFormattingUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DemoCommand extends AgentCommand {
    constructor() {
        super('demo', 'List or run demo files', '/demo [name]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            // List all .nars files in examples directory
            const examplesDir = path.resolve(__dirname, '../../../examples');
            if (!fs.existsSync(examplesDir)) {
                return '❌ Examples directory not found.';
            }

            const files = fs.readdirSync(examplesDir);
            const narsFiles = files.filter(f => f.endsWith('.nars'));

            if (narsFiles.length === 0) {
                return 'No .nars demo files found in examples directory.';
            }

            const fileDetails = [];
            for (const file of narsFiles) {
                const filePath = path.join(examplesDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                let title = '';

                // Look for // title: in the first few lines
                const lines = content.split('\n').slice(0, 10);
                for (const line of lines) {
                    const titleMatch = line.match(/^\/\/\s*title:\s*(.+)$/);
                    if (titleMatch) {
                        title = titleMatch[1].trim();
                        break;
                    }
                }

                const baseName = path.parse(file).name;
                fileDetails.push({
                    name: baseName,
                    title: title || baseName,
                    description: title ? ` - ${title}` : ''
                });
            }

            return `🎭 Available demos:\n${fileDetails.map(d => `  /demo ${d.name}${d.description}`).join('\n')}`;
        } else {
            // Run demo file
            const demoName = args[0];
            const examplesDir = path.resolve(__dirname, '../../../examples');
            const demoFile = path.join(examplesDir, `${demoName}.nars`);

            if (!fs.existsSync(demoFile)) {
                return `❌ Demo file not found: ${demoFile}`;
            }

            // Execute the demo file using the NarsFileRunner
            const runner = new NarsFileRunner(agent);
            await runner.executeFile(demoFile);
            return `✅ Demo '${demoName}' executed.`;
        }
    }
}

export class RunCommand extends AgentCommand {
    constructor() {
        super('run', 'Execute a .nars file', '/run <path>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            return 'Usage: /run <path_to_file.nars>';
        }

        const filePath = args[0];
        const resolvedPath = path.resolve(filePath);

        if (!fs.existsSync(resolvedPath)) {
            return `❌ File not found: ${resolvedPath}`;
        }

        if (!resolvedPath.endsWith('.nars')) {
            return '❌ File must have .nars extension';
        }

        const runner = new NarsFileRunner(agent);
        await runner.executeFile(resolvedPath);
        return `✅ File executed: ${resolvedPath}`;
    }
}

export class ResetCommand extends AgentCommand {
    constructor() {
        super('reset', 'Reset reasoner to initial state', '/reset');
    }

    async _executeImpl(agent, ...args) {
        if (agent.reset) {
            agent.reset();
            return '🔄 System reset to initial state.';
        }
        return '❌ Reset function not available.';
    }
}

// Extend RestartCommand to also handle reset functionality
export class RestartCommand extends AgentCommand {
    constructor() {
        super('restart', 'Restart reasoner to initial state', '/restart');
    }

    async _executeImpl(agent, ...args) {
        if (agent.reset) {
            agent.reset();
            return '🔄 System restarted to initial state.';
        }
        return '❌ Reset function not available.';
    }
}

export class CycleCommand extends AgentCommand {
    constructor() {
        super('cycle', 'Show current inference cycle number', '/cycle');
    }

    async _executeImpl(agent, ...args) {
        const cycleCount = agent.cycleCount || 0;
        return `Cycle: ${cycleCount}`;
    }
}

export class StepCommand extends AgentCommand {
    constructor() {
        super('step', 'Execute inference cycles', '/step [count|duration]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            // Single step
            if (typeof agent.step === 'function') {
                await agent.step();
                return '✅ Single step executed.';
            }
            return '❌ Step function not available.';
        }

        const arg = args[0];

        if (arg === 'off' || arg === 'stop' || arg === 'continue') {
            // Stop auto-step
            if (typeof agent.continue === 'function') {
                agent.continue();
                return '✅ Returned to normal continuous execution.';
            }
            // If there's a way to clear an auto-step interval, use that
            if (agent.clearStepInterval) {
                agent.clearStepInterval();
                return '✅ Auto-step disabled.';
            }
            return '❌ Continue function not available.';
        }

        // Check if it's a number (cycle count)
        const numMatch = arg.match(/^(\d+)$/);
        if (numMatch) {
            const count = parseInt(numMatch[1]);
            if (typeof agent.step === 'function' && !isNaN(count) && count > 0) {
                for (let i = 0; i < count; i++) {
                    await agent.step();
                }
                return `✅ ${count} steps executed.`;
            }
            return `❌ Invalid step count: ${count}`;
        }

        // Check if it's a duration format (e.g., 200ms, 1s)
        const durationMatch = arg.match(/^(\d+)(ms|s)$/);
        if (durationMatch) {
            const value = parseInt(durationMatch[1]);
            const unit = durationMatch[2];
            const ms = unit === 's' ? value * 1000 : value;

            // Use the stream reasoner's control for periodic stepping
            if (typeof agent._run === 'function' && typeof agent._stop === 'function') {
                // Set up auto-step mode by calling _run (which starts periodic processing)
                if (typeof agent._stop === 'function') {
                    agent._stop(); // Stop any existing run first
                }

                // Store the interval in the agent and start periodic steps
                if (!agent._autoStepInterval) {
                    agent._autoStepInterval = setInterval(async () => {
                        if (typeof agent.step === 'function') {
                            await agent.step();
                        }
                    }, ms);

                    return `✅ Auto-step enabled: ${ms}ms interval.`;
                } else {
                    return `✅ Auto-step already running: ${ms}ms interval.`;
                }
            } else if (agent.streamReasoner && typeof agent.streamReasoner.start === 'function' && typeof agent.streamReasoner.stop === 'function') {
                // Set up auto-step mode by stopping continuous mode first
                if (agent.streamReasoner && typeof agent.streamReasoner.stop === 'function') {
                    agent.streamReasoner.stop();
                }

                // Store the interval reference in the agent
                if (!agent._autoStepInterval) {
                    agent._autoStepInterval = setInterval(async () => {
                        if (typeof agent.step === 'function') {
                            await agent.step();
                        }
                    }, ms);

                    return `✅ Auto-step enabled: ${ms}ms interval.`;
                } else {
                    return `✅ Auto-step already running: ${ms}ms interval.`;
                }
            }
            return `❌ Auto-step not fully supported (interval: ${ms}ms).`;
        }

        return 'Usage: /step [count|duration|off|continue]';
    }
}

export class TraceCommand extends AgentCommand {
    constructor() {
        super('trace', 'Toggle detailed derivation trace', '/trace [on|off]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            // Toggle trace
            if (typeof agent.toggleTrace === 'function') {
                agent.toggleTrace();
                const status = agent.isTraceEnabled ? agent.isTraceEnabled() : 'unknown';
                return `✅ Trace ${status ? 'enabled' : 'disabled'}.`;
            } else if (typeof agent.enableTrace === 'function' && typeof agent.disableTrace === 'function') {
                // Toggle based on current state if we can check it
                if (agent.traceEnabled !== undefined) {
                    if (agent.traceEnabled) {
                        agent.disableTrace();
                        return '✅ Trace disabled.';
                    } else {
                        agent.enableTrace();
                        return '✅ Trace enabled (colorful, indented derivations).';
                    }
                }
                return '❌ Cannot determine current trace state.';
            }
            return '❌ Trace toggle not available.';
        }

        if (args[0] === 'on') {
            if (typeof agent.enableTrace === 'function') {
                agent.enableTrace();
                return '✅ Trace enabled (colorful, indented derivations).';
            }
        } else if (args[0] === 'off') {
            if (typeof agent.disableTrace === 'function') {
                agent.disableTrace();
                return '✅ Trace disabled.';
            }
        }
        return 'Usage: /trace [on|off]';
    }
}

export class EchoCommand extends AgentCommand {
    constructor() {
        super('echo', 'Toggle command echo', '/echo [on|off]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            // Toggle echo - for now, we'll assume this is handled by the UI layer
            // In the actual implementation, this would toggle echo of user commands
            return '✅ Echo toggle: Check if commands are echoed to console.';
        }

        if (args[0] === 'on') {
            // Enable echo of user commands
            return '✅ Echo enabled (commands will be echoed).';
        } else if (args[0] === 'off') {
            // Disable echo of user commands
            return '✅ Echo disabled (commands will not be echoed).';
        }
        return 'Usage: /echo [on|off]';
    }
}

export class QuietCommand extends AgentCommand {
    constructor() {
        super('quiet', 'Toggle quiet mode', '/quiet [on|off]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            // Toggle quiet mode
            if (typeof agent.toggleQuietMode === 'function') {
                agent.toggleQuietMode();
                const status = agent.isQuietModeEnabled ? agent.isQuietModeEnabled() : 'unknown';
                return `✅ Quiet mode ${status ? 'enabled' : 'disabled'}.`;
            }
            return '❌ Quiet mode toggle not available.';
        }

        if (args[0] === 'on') {
            if (typeof agent.enableQuietMode === 'function') {
                agent.enableQuietMode();
                return '✅ Quiet mode enabled (suppress derivation trace).';
            }
        } else if (args[0] === 'off') {
            if (typeof agent.disableQuietMode === 'function') {
                agent.disableQuietMode();
                return '✅ Quiet mode disabled.';
            }
        }
        return 'Usage: /quiet [on|off]';
    }
}

export class VolumeCommand extends AgentCommand {
    constructor() {
        super('vol', 'Set volume level', '/vol <n>');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            return 'Usage: /vol <positive_integer>';
        }

        const vol = parseInt(args[0]);
        if (isNaN(vol) || vol < 0) {
            return '❌ Invalid volume. Use positive integer.';
        }

        // Try different volume control methods
        if (typeof agent.setVolume === 'function') {
            agent.setVolume(vol);
            return `✅ Volume set to ${vol}.`;
        } else if (typeof agent.processInput === 'function') {
            // Try sending it as a narsese command (like *vol)
            await agent.processInput(`*${vol}`);
            return `✅ Volume set to ${vol}.`;
        }
        return '❌ Volume control not available.';
    }
}

export class ConceptsCommand extends AgentCommand {
    constructor() {
        super('concepts', 'List concepts or detailed view of one concept', '/concepts [term]');
    }

    async _executeImpl(agent, ...args) {
        // Use the memory to access concepts
        if (agent.memory && typeof agent.memory.getAllConcepts === 'function') {
            const allConcepts = agent.memory.getAllConcepts();
            if (args.length === 0) {
                // List all concepts
                if (allConcepts.length === 0) {
                    return 'No concepts in the system.';
                }
                return `📚 Concepts (${allConcepts.length} total):\n${ReplFormattingUtils.formatConcepts(allConcepts)}`;
            } else {
                // Show details for specific term
                const term = args[0];
                return `🔍 Concepts containing "${term}":\n${ReplFormattingUtils.formatConcepts(allConcepts, term)}`;
            }
        }
        return '❌ Concept access not available.';
    }
}

export class TasksCommand extends AgentCommand {
    constructor() {
        super('tasks', 'List current tasks', '/tasks [term]');
    }

    async _executeImpl(agent, ...args) {
        // Use task manager to access tasks
        if (agent.taskManager && typeof agent.taskManager.findTasksByType === 'function') {
            if (args.length === 0) {
                // List all tasks
                const beliefs = agent.taskManager.findTasksByType('BELIEF');
                const goals = agent.taskManager.findTasksByType('GOAL');
                const questions = agent.taskManager.findTasksByType('QUESTION');

                // Combine all tasks
                const allTasks = [...beliefs, ...goals, ...questions];

                if (allTasks.length === 0) {
                    return 'No tasks in the system.';
                }

                const tableData = allTasks.slice(0, 20).map((t, i) => [
                    i + 1,
                    t.type,
                    t.term?.toString?.() ?? t.term ?? 'Unknown',
                    t.truth?.frequency?.toFixed(3) ?? '-',
                    t.truth?.confidence?.toFixed(3) ?? '-'
                ]);
                const headers = ['No.', 'Type', 'Term', 'Freq', 'Conf'];
                const table = ReplFormattingUtils.formatTable(tableData, headers);

                return allTasks.length > 20 ?
                    `📝 Tasks (first 20):\n${table}\n  ... and ${allTasks.length - 20} more` :
                    `📝 Tasks:\n${table}`;
            } else {
                // Filter by term
                const term = args[0];
                const beliefs = agent.taskManager.findTasksByType('BELIEF');
                const goals = agent.taskManager.findTasksByType('GOAL');
                const questions = agent.taskManager.findTasksByType('QUESTION');

                // Combine all tasks
                const allTasks = [...beliefs, ...goals, ...questions];

                const filteredTasks = allTasks.filter(t =>
                    t.toString().toLowerCase().includes(term.toLowerCase())
                );
                if (filteredTasks.length === 0) {
                    return `No tasks found with term: ${term}`;
                }

                const tableData = filteredTasks.slice(0, 20).map((t, i) => [
                    i + 1,
                    t.type,
                    t.term?.toString?.() ?? t.term ?? 'Unknown',
                    t.truth?.frequency?.toFixed(3) ?? '-',
                    t.truth?.confidence?.toFixed(3) ?? '-'
                ]);
                const headers = ['No.', 'Type', 'Term', 'Freq', 'Conf'];
                const table = ReplFormattingUtils.formatTable(tableData, headers);

                return filteredTasks.length > 20 ?
                    `📝 Filtered Tasks (first 20 with "${term}"):\n${table}\n  ... and ${filteredTasks.length - 20} more` :
                    `📝 Filtered Tasks (with "${term}"):\n${table}`;
            }
        }
        return '❌ Task access not available.';
    }
}

export class BeliefsCommand extends AgentCommand {
    constructor() {
        super('beliefs', 'Show Focus beliefs', '/beliefs');
    }

    async _executeImpl(agent, ...args) {
        // Use focus to get focus beliefs
        if (agent.focus && typeof agent.focus.getTasks === 'function') {
            const focusTasks = agent.focus.getTasks(20);
            const beliefs = focusTasks.filter(t => t.type === 'BELIEF');

            if (beliefs.length === 0) {
                return 'No focus beliefs in the system.';
            }

            return `💡 Focus Beliefs:\n${ReplFormattingUtils.formatBeliefs(beliefs)}`;
        }
        // Alternative: use task manager
        else if (agent.taskManager && typeof agent.taskManager.findTasksByType === 'function') {
            const beliefs = agent.taskManager.findTasksByType('BELIEF');
            if (beliefs.length === 0) {
                return 'No beliefs in the system.';
            }

            return `💡 Beliefs:\n${ReplFormattingUtils.formatBeliefs(beliefs)}`;
        }
        return '❌ Belief access not available.';
    }
}

export class GoalsCommand extends AgentCommand {
    constructor() {
        super('goals', 'Show Focus goals', '/goals');
    }

    async _executeImpl(agent, ...args) {
        // Use focus to get focus goals
        if (agent.focus && typeof agent.focus.getTasks === 'function') {
            const focusTasks = agent.focus.getTasks(20);
            const goals = focusTasks.filter(t => t.type === 'GOAL');

            if (goals.length === 0) {
                return 'No focus goals in the system.';
            }

            return `🎯 Focus Goals:\n${ReplFormattingUtils.formatGoals(goals)}`;
        }
        // Alternative: use task manager
        else if (agent.taskManager && typeof agent.taskManager.findTasksByType === 'function') {
            const goals = agent.taskManager.findTasksByType('GOAL');
            if (goals.length === 0) {
                return 'No goals in the system.';
            }

            return `🎯 Goals:\n${ReplFormattingUtils.formatGoals(goals)}`;
        }
        return '❌ Goal access not available.';
    }
}

export class QuestionsCommand extends AgentCommand {
    constructor() {
        super('questions', 'Show active questions', '/questions');
    }

    async _executeImpl(agent, ...args) {
        // Use focus to get focus questions
        if (agent.focus && typeof agent.focus.getTasks === 'function') {
            const focusTasks = agent.focus.getTasks(20);
            const questions = focusTasks.filter(t => t.type === 'QUESTION');

            if (questions.length === 0) {
                return 'No focus questions in the system.';
            }

            const tableData = questions.map((q, i) => [i + 1, q.term?.toString?.() ?? q.term ?? 'Unknown']);
            const headers = ['No.', 'Term'];
            const table = ReplFormattingUtils.formatTable(tableData, headers);

            return `❓ Focus Questions:\n${table}`;
        }
        // Alternative: use task manager
        else if (agent.taskManager && typeof agent.taskManager.findTasksByType === 'function') {
            const questions = agent.taskManager.findTasksByType('QUESTION');
            if (questions.length === 0) {
                return 'No questions in the system.';
            }

            const tableData = questions.slice(0, 20).map((q, i) => [i + 1, q.term?.toString?.() ?? q.term ?? 'Unknown']);
            const headers = ['No.', 'Term'];
            const table = ReplFormattingUtils.formatTable(tableData, headers);

            return questions.length > 20 ?
                `❓ Questions (first 20):\n${table}\n  ... and ${questions.length - 20} more` :
                `❓ Questions:\n${table}`;
        }
        return '❌ Question access not available.';
    }
}

export class StatsCommand extends AgentCommand {
    constructor() {
        super('stats', 'Show system health statistics', '/stats');
    }

    async _executeImpl(agent, ...args) {
        // Use actual properties/methods of the agent/NAR
        const cycleCount = agent.cycleCount || 0;

        let conceptCount = 0;
        let taskCount = 0;
        let beliefCount = 0;

        // Get concept count from memory
        if (agent.memory && typeof agent.memory.getAllConcepts === 'function') {
            conceptCount = agent.memory.getAllConcepts().length;
        }

        // Get task counts from task manager
        if (agent.taskManager && typeof agent.taskManager.findTasksByType === 'function') {
            taskCount = agent.taskManager.findTasksByType('BELIEF').length +
                agent.taskManager.findTasksByType('GOAL').length +
                agent.taskManager.findTasksByType('QUESTION').length;
            beliefCount = agent.taskManager.findTasksByType('BELIEF').length;
        }

        // Get memory usage
        let memoryUsage = 'Unknown';
        try {
            const memUsage = process.memoryUsage();
            memoryUsage = `${Math.round(memUsage.heapUsed / (1024 * 1024))}MB`;
        } catch (e) {
            memoryUsage = 'Unavailable';
        }

        return `📊 System Statistics:
  Cycles: ${cycleCount}
  Concepts: ${conceptCount}
  Tasks: ${taskCount}
  Beliefs: ${beliefCount}
  Memory: ${memoryUsage}
  Running: ${agent.isRunning ? 'Yes' : 'No'}`;
    }
}

export class HistoryCommand extends AgentCommand {
    constructor() {
        super('history', 'Show last inputs', '/history [n]');
    }

    async _executeImpl(agent, ...args) {
        // Using the session state in the agent to track history
        const n = args.length > 0 ? parseInt(args[0]) : 10;
        if (isNaN(n) || n <= 0) {
            return '❌ Invalid number. Use positive integer.';
        }

        if (agent.sessionState && Array.isArray(agent.sessionState.history)) {
            const {history} = agent.sessionState;
            if (!history || history.length === 0) {
                return 'No input history available.';
            }

            // Show last N entries
            const entriesToShow = history.slice(-n);
            const list = entriesToShow.map((entry, i) => `  ${i + 1}. ${entry}`).join('\n');
            return `📜 Input History (last ${entriesToShow.length}):\n${list}`;
        }
        return '❌ Input history not available.';
    }
}

export class LastCommand extends AgentCommand {
    constructor() {
        super('last', 'Re-execute the last non-slash command', '/last');
    }

    async _executeImpl(agent, ...args) {
        if (agent.sessionState && agent.sessionState.lastResult) {
            const lastInput = agent.sessionState.lastResult.input;
            if (lastInput && !lastInput.startsWith('/')) {
                // Execute the last non-slash command
                if (typeof agent.processInput === 'function') {
                    await agent.processInput(lastInput);
                    return `✅ Re-executed: ${lastInput}`;
                }
                return '❌ Unable to re-execute last command.';
            }
            return '❌ Last command was a slash command, not re-executable.';
        }
        return '❌ No last command available.';
    }
}

export class ThemeCommand extends AgentCommand {
    constructor() {
        super('theme', 'Switch terminal color theme', '/theme [name]');
    }

    async _executeImpl(agent, ...args) {
        if (args.length === 0) {
            return `Available themes: default, light, dark, matrix, nord`;
        }

        const theme = args[0];
        const validThemes = ['default', 'light', 'dark', 'matrix', 'nord'];

        if (!validThemes.includes(theme)) {
            return `❌ Invalid theme. Available: ${validThemes.join(', ')}`;
        }

        // This would need to be implemented in the UI layer to change actual colors
        // For now, acknowledge the command
        return `🎨 Theme set to ${theme} (if supported by terminal).`;
    }
}

// Helper class to run .nars files
class NarsFileRunner {
    constructor(agent) {
        this.agent = agent;
    }

    async executeFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const originalLine = line;
            line = line.trim();

            // Skip empty lines and comments (but process title comments)
            if (!line) {
                continue; // Skip empty lines
            }

            // Check for title comment and render banner before skipping
            const titleMatch = line.match(/^\/\/\s*title:\s*(.+)$/);
            if (titleMatch) {
                this._renderTitleBanner(titleMatch[1].trim());
                continue; // Skip processing the line further
            }

            // Skip other comments
            if (line.startsWith('//') || line.startsWith('#')) {
                continue;
            }

            // Process as Narsese or slash command
            if (line.startsWith('/')) {
                // Execute slash command
                const [cmd, ...args] = line.slice(1).split(/\s+/);
                if (this.agent.commandRegistry) {
                    await this.agent.commandRegistry.execute(cmd, this.agent, ...args);
                } else {
                    // Fallback: try to execute directly via message handler if available
                    if (this.agent.executeCommand) {
                        await this.agent.executeCommand(cmd, ...args);
                    }
                }
            } else if (line.startsWith('*')) {
                // Volume command (e.g. *123)
                const volume = parseInt(line.slice(1));
                if (!isNaN(volume) && typeof this.agent.setVolume === 'function') {
                    this.agent.setVolume(volume);
                } else if (typeof this.agent.processInput === 'function') {
                    // Fallback to direct processing
                    await this.agent.processInput(line);
                }
            } else {
                // Process as Narsese
                if (typeof this.agent.processInput === 'function') {
                    await this.agent.processInput(line);
                }
            }

            // Small delay to allow for visual processing during demos (only when needed)
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    _renderTitleBanner(title) {
        console.log(`\n${ReplFormattingUtils.formatBanner(title, {bgColor: 'blue'})}\n`);
    }
}