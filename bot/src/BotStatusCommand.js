/**
 * BotStatusCommand — /status slash command for CLI mode.
 *
 * Registered by the Bot after Agent initialization.
 * Shows: uptime, profile, nick, loop state, embodiment statuses.
 */
import { AgentCommand } from '@senars/agent';

export class BotStatusCommand extends AgentCommand {
    constructor(botInstance) {
        super('status', 'Show bot status (embodiments, loop, uptime)', 'status');
        this._bot = botInstance;
    }

    _executeImpl() {
        if (!this._bot) {
            return 'Status unavailable — bot reference not set.';
        }
        const s = this._bot.status;
        const uptimeSec = Math.round(s.uptime / 1000);
        const lines = [
            `Bot: ${s.nick} [${s.profile}]`,
            `  Uptime: ${uptimeSec}s`,
            `  Running: ${s.started}`,
            `  Loop: cycle=${s.loop.cycleCount} running=${s.loop.running} paused=${s.loop.paused} llm=${s.loop.llmReady}`,
            `  Embodiments: ${Object.entries(s.embodiments).map(([id, e]) => `${id}=${e.status}`).join(', ') || '(none)'}`,
        ];
        return lines.join('\n');
    }
}
